import { redirect } from "next/navigation";
import { AuthRoutes } from "@/app/api/auth/auth.route";
import { getSessionUserFromCookieStore } from "@/app/api/auth/auth.service";
import RegisterForm from "@/components/RegisterForm";

export default async function RegisterPage() {
  const currentUser = await getSessionUserFromCookieStore();
  if (currentUser) {
    redirect(AuthRoutes.homePage);
  }

  return <RegisterForm />;
}
