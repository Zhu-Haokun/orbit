import { Link } from "react-router-dom";

import { AuthLayout } from "@/features/auth/AuthLayout";
import { LoginForm } from "@/features/auth/AuthForms";

export default function LoginPage() {
  return (
    <AuthLayout
      title="回来就好"
      subtitle="你的星图还在原来的位置。"
      footer={
        <>
          还没有星图？
          <Link to="/register" className="ml-1 text-accent hover:text-accent-hover">
            创建一张
          </Link>
        </>
      }
    >
      <LoginForm />
    </AuthLayout>
  );
}
