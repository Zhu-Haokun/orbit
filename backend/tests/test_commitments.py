"""未完待续状态流转测试（规范 §23 / §44 / §89）。"""

from __future__ import annotations

from fastapi.testclient import TestClient


def _person(client: TestClient, headers: dict[str, str]) -> dict:
    response = client.post("/api/people", json={"name": "陈屿"}, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


def _commitment(client: TestClient, headers: dict[str, str], person_id: str, content: str = "把租房网站发给他") -> dict:
    response = client.post("/api/commitments", json={"personId": person_id, "content": content}, headers=headers)
    assert response.status_code in (200, 201), response.text
    return response.json()


def test_open_to_done_sets_completed_at(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)
    commitment = _commitment(client, auth_headers, person["id"])

    assert commitment["status"] == "open"
    assert commitment["completedAt"] is None

    done = client.patch(f"/api/commitments/{commitment['id']}", json={"status": "done"}, headers=auth_headers)
    assert done.status_code == 200, done.text
    body = done.json()
    assert body["status"] == "done"
    assert body["completedAt"] is not None
    assert body["completedAt"].endswith("Z")


def test_done_back_to_open_clears_completed_at(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)
    commitment = _commitment(client, auth_headers, person["id"])

    client.patch(f"/api/commitments/{commitment['id']}", json={"status": "done"}, headers=auth_headers)
    reopened = client.patch(
        f"/api/commitments/{commitment['id']}", json={"status": "open"}, headers=auth_headers
    ).json()
    assert reopened["status"] == "open"
    assert reopened["completedAt"] is None


def test_later_is_still_counted_as_open(client: TestClient, auth_headers: dict[str, str]) -> None:
    """§23：``later``（稍后）没有完成，仍然算“未完成”。"""
    person = _person(client, auth_headers)
    commitment = _commitment(client, auth_headers, person["id"])

    later = client.patch(f"/api/commitments/{commitment['id']}", json={"status": "later"}, headers=auth_headers).json()
    assert later["status"] == "later"
    assert later["completedAt"] is None

    detail = client.get(f"/api/people/{person['id']}", headers=auth_headers).json()
    assert detail["openCommitmentCount"] == 1


def test_cancelled_is_not_counted(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)
    commitment = _commitment(client, auth_headers, person["id"])

    cancelled = client.patch(
        f"/api/commitments/{commitment['id']}", json={"status": "cancelled"}, headers=auth_headers
    ).json()
    assert cancelled["status"] == "cancelled"
    assert cancelled["completedAt"] is None

    detail = client.get(f"/api/people/{person['id']}", headers=auth_headers).json()
    assert detail["openCommitmentCount"] == 0


def test_filter_by_person_and_status(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)
    other = client.post("/api/people", json={"name": "妈妈"}, headers=auth_headers).json()

    mine = _commitment(client, auth_headers, person["id"], "发租房网站")
    theirs = _commitment(client, auth_headers, other["id"], "看路由器型号")
    client.patch(f"/api/commitments/{theirs['id']}", json={"status": "done"}, headers=auth_headers)

    only_mine = client.get(f"/api/commitments?personId={person['id']}", headers=auth_headers).json()
    assert [item["id"] for item in only_mine] == [mine["id"]]

    open_only = client.get("/api/commitments?status=open", headers=auth_headers).json()
    assert [item["id"] for item in open_only] == [mine["id"]]

    done_only = client.get("/api/commitments?status=done", headers=auth_headers).json()
    assert [item["id"] for item in done_only] == [theirs["id"]]


def test_edit_and_delete_commitment(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)
    commitment = _commitment(client, auth_headers, person["id"])

    edited = client.patch(
        f"/api/commitments/{commitment['id']}",
        json={"content": "把租房网站和搬家攻略一起发给他", "dueText": "这周"},
        headers=auth_headers,
    ).json()
    assert edited["content"] == "把租房网站和搬家攻略一起发给他"
    assert edited["dueText"] == "这周"
    # 只改内容时状态不变。
    assert edited["status"] == "open"

    assert client.delete(f"/api/commitments/{commitment['id']}", headers=auth_headers).status_code == 204
    assert client.get("/api/commitments", headers=auth_headers).json() == []


def test_creating_done_commitment_stamps_completed_at(client: TestClient, auth_headers: dict[str, str]) -> None:
    person = _person(client, auth_headers)
    created = client.post(
        "/api/commitments",
        json={"personId": person["id"], "content": "已经做完的事", "status": "done"},
        headers=auth_headers,
    ).json()
    assert created["status"] == "done"
    assert created["completedAt"] is not None
