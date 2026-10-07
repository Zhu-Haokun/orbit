import { useNavigate } from "react-router-dom";

import { OrbitLogo } from "@/components/layout/OrbitLogo";
import { Button } from "@/components/ui/Button";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-base px-6 text-center">
      <OrbitLogo size={26} />
      <p className="text-body text-ink-2">这里没有找到任何东西。</p>
      <Button variant="secondary" size="sm" onClick={() => navigate("/galaxy")}>
        回到星图
      </Button>
    </div>
  );
}
