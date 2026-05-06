import { redirect } from "next/navigation";
import { ACCESS_TOKEN_EXPIRES_IN } from "@/app/api/auth/auth.constant";
import { AuthRoutes } from "@/app/api/auth/auth.route";
import { getSessionUserFromCookieStore } from "@/app/api/auth/auth.service";
import HabitTracker from "@/components/HabitTracker";

export default async function Home() {
  const currentUser = await getSessionUserFromCookieStore();

  if (!currentUser) {
    redirect(AuthRoutes.loginPage);
  }

  return (
    <HabitTracker
      currentUser={currentUser}
      accessTokenExpiresIn={ACCESS_TOKEN_EXPIRES_IN}
    />
  );
}
