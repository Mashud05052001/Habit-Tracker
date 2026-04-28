import { redirect } from "next/navigation";
import { AuthRoutes } from "@/app/api/auth/auth.route";
import { getSessionUserFromCookieStore } from "@/app/api/auth/auth.service";
import LoginForm from "@/components/LoginForm";

type TSearchParams = {
  verified?: string | string[];
  message?: string | string[];
};

function readSearchParam(value?: string | string[]) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: TSearchParams;
}) {
  const currentUser = await getSessionUserFromCookieStore();
  if (currentUser) {
    redirect(AuthRoutes.homePage);
  }

  const verified = readSearchParam(searchParams?.verified);
  const message = readSearchParam(searchParams?.message);

  let initialNotice: { tone: "success" | "error" | "info"; message: string } | null = null;
  if (verified === "1") {
    initialNotice = {
      tone: "success",
      message: "Email verified. You can log in now.",
    };
  } else if (verified === "0") {
    initialNotice = {
      tone: "error",
      message: message || "Verification failed. Try registering again.",
    };
  }

  return <LoginForm initialNotice={initialNotice} />;
}
