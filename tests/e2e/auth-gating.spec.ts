import { expect, test, type Page } from "@playwright/test";

const E2E_COOKIE = "e2e_session_user";

async function setBypassSession(page: Page, user: { sub: string; email: string; role?: "coach" | "admin"; coachMember?: boolean }) {
  const payload = encodeURIComponent(JSON.stringify({
    sub: user.sub,
    email: user.email,
    role: user.role ?? "coach",
    coachMember: user.coachMember
  }));
  await page.context().addCookies([{
    name: E2E_COOKIE,
    value: payload,
    domain: "127.0.0.1",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax"
  }]);
}

test("non-authenticated user is redirected from /chat to sign-in", async ({ page }) => {
  await page.goto("/chat");

  await expect(page).toHaveURL(/\/signin\?callbackUrl=\/chat$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("authenticated non-coach is redirected from /chat to access denied", async ({ page }) => {
  await setBypassSession(page, { sub: "user_non_coach", email: "noc@example.com", role: "coach", coachMember: false });
  await page.goto("/chat");

  await expect(page).toHaveURL(/\/access-denied$/);
  await expect(page.getByRole("heading", { name: "Access denied" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
});

test("authenticated coach can load /chat", async ({ page }) => {
  await setBypassSession(page, { sub: "user_coach", email: "coach@example.com", role: "coach", coachMember: true });
  await page.goto("/chat");

  await expect(page).toHaveURL(/\/chat$/);
});
