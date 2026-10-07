import { Link } from "react-router-dom";

import { AuthLayout } from "@/features/auth/AuthLayout";
import { RegisterForm } from "@/features/auth/AuthForms";

export default function RegisterPage() {
  return (
    <AuthLayout
      title="创建你的星图"
      subtitle="先从一个你想记住的人开始。"
      footer={
        <>
          已经有星图了？
          <Link to="/login" className="ml-1 text-accent hover:text-accent-hover">
            直接进入
          </Link>
        </>
      }
    >
      <RegisterForm />
    </AuthLayout>
  );
}
