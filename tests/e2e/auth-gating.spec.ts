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

test("selected class is sent in generate request", async ({ page }) => {
  await setBypassSession(page, { sub: "user_coach", email: "coach@example.com", role: "coach", coachMember: true });

  await page.route("**/api/chat/bootstrap", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        coach: { id: "tenant_1", businessName: "Fit Lab", coachName: "Alex", coachPhotoUrl: null, businessLogoUrl: null, bio: null, brandHeadline: null, headerTagline: null, themePrimaryColor: null, themeSecondaryColor: null, igUsername: null },
        locations: [{ id: "loc_1", businessName: "Fit Lab", locationName: "Downtown", logoUrl: null, isDefault: true, sortOrder: 0 }],
        classes: [{ id: "class_1", timerNameAtRun: "Morning Blast", category: "HIIT", classDate: "2026-05-20", startTime: "2026-05-20T10:00:00.000Z", endTime: "2026-05-20T11:00:00.000Z", locationId: "loc_1", locationLabelAtRun: "Downtown", stationWorkoutTypesJson: "[\"squat\"]", timerSnapshotJson: "{\"stationCount\":1}", ranAt: "2026-05-20T10:00:00.000Z" }],
        assets: [],
        templates: [],
        sessions: [{ id: "chat_1", title: "Test Session", createdAt: "2026-05-20T10:00:00.000Z", updatedAt: "2026-05-20T10:00:00.000Z" }],
        defaults: { selectedLocationId: "loc_1", selectedClassId: "class_1" }
      })
    });
  });
  await page.route("**/api/chat/sessions/chat_created/messages", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [] }) });
  });
  await page.route("**/api/chat/sessions", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "chat_created", title: "New session", createdAt: "2026-05-20T10:00:00.000Z", updatedAt: "2026-05-20T10:00:00.000Z" }) });
      return;
    }
    await route.fallback();
  });

  let generatePayload: Record<string, unknown> | null = null;
  await page.route("**/api/chat/generate", async (route) => {
    const body = route.request().postData() ?? "{}";
    generatePayload = JSON.parse(body) as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "completed", messageId: "msg_1", image: { signedUrl: "https://example.com/i.png", expiresAt: "2026-05-20T12:00:00.000Z" }, usage: { inputTokens: 1, outputTokens: 1, estimatedCost: 0, durationMs: 1, model: "gpt-image-1" } }) });
  });

  await page.goto("/chat");
  await page.locator("select").first().selectOption("class_1");
  await page.getByPlaceholder("Describe the image you want to generate").fill("Create a class promo post");
  await page.getByRole("button", { name: "Generate" }).click();

  await expect.poll(() => generatePayload?.classId).toBe("class_1");
});

test("generation is blocked until a HIIT class is selected", async ({ page }) => {
  await setBypassSession(page, { sub: "user_coach", email: "coach@example.com", role: "coach", coachMember: true });

  await page.route("**/api/chat/bootstrap", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        coach: null,
        locations: [],
        classes: [],
        assets: [],
        templates: [],
        sessions: [{ id: "chat_1", title: "Test Session", createdAt: "2026-05-20T10:00:00.000Z", updatedAt: "2026-05-20T10:00:00.000Z" }],
        defaults: { selectedLocationId: undefined, selectedClassId: undefined }
      })
    });
  });
  await page.route("**/api/chat/sessions/chat_1/messages", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [] }) });
  });

  let generateCalled = false;
  await page.route("**/api/chat/generate", async (route) => {
    generateCalled = true;
    await route.fulfill({ status: 500, contentType: "application/json", body: "{}" });
  });

  await page.goto("/chat");
  await page.getByPlaceholder("Describe the image you want to generate").fill("Create a class promo post");
  await page.getByRole("button", { name: "Generate" }).click();

  await expect(page.getByText("Select a HIIT class before generating an image.")).toBeVisible();
  expect(generateCalled).toBe(false);
});

test("selected template populates the prompt editor", async ({ page }) => {
  await setBypassSession(page, { sub: "user_coach", email: "coach@example.com", role: "coach", coachMember: true });

  await page.route("**/api/chat/bootstrap", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        coach: null,
        locations: [],
        classes: [],
        assets: [],
        templates: [
          { id: "tpl_1", title: "Promo", platform: "instagram", format: "square", templateFamilyId: null, templateVersion: 1, promptText: "Template prompt text", defaultOptionsJson: null }
        ],
        sessions: [{ id: "chat_1", title: "Test Session", createdAt: "2026-05-20T10:00:00.000Z", updatedAt: "2026-05-20T10:00:00.000Z" }],
        defaults: {}
      })
    });
  });
  await page.route("**/api/chat/sessions/chat_1/messages", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [] }) });
  });

  await page.goto("/chat");

  await expect(page.getByPlaceholder("Describe the image you want to generate")).toHaveValue("Template prompt text");
});

test("generate creates a session when none exists", async ({ page }) => {
  await setBypassSession(page, { sub: "user_coach", email: "coach@example.com", role: "coach", coachMember: true });

  await page.route("**/api/chat/bootstrap", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        coach: null,
        locations: [{ id: "loc_1", businessName: "Fit Lab", locationName: "Downtown", logoUrl: null, isDefault: true, sortOrder: 0 }],
        classes: [{ id: "class_1", timerNameAtRun: "Morning Blast", category: "HIIT", classDate: "2026-05-20", startTime: "2026-05-20T10:00:00.000Z", endTime: "2026-05-20T11:00:00.000Z", locationId: "loc_1", locationLabelAtRun: "Downtown", stationWorkoutTypesJson: "[\"squat\"]", timerSnapshotJson: "{\"stationCount\":1}", ranAt: "2026-05-20T10:00:00.000Z" }],
        assets: [],
        templates: [],
        sessions: [],
        defaults: { selectedLocationId: "loc_1" }
      })
    });
  });
  await page.route("**/api/chat/sessions/chat_created/messages", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ messages: [] }) });
  });

  let sessionCreated = false;
  await page.route("**/api/chat/sessions", async (route) => {
    if (route.request().method() === "POST") {
      sessionCreated = true;
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "chat_created", title: "New session", createdAt: "2026-05-20T10:00:00.000Z", updatedAt: "2026-05-20T10:00:00.000Z" }) });
      return;
    }
    await route.fallback();
  });

  let generatePayload: Record<string, unknown> | null = null;
  await page.route("**/api/chat/generate", async (route) => {
    generatePayload = JSON.parse(route.request().postData() ?? "{}") as Record<string, unknown>;
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ status: "completed", messageId: "msg_1", image: { signedUrl: "https://example.com/i.png", expiresAt: "2026-05-20T12:00:00.000Z" }, usage: { inputTokens: 1, outputTokens: 1, estimatedCost: 0, durationMs: 1, model: "gpt-image-1" } }) });
  });

  await page.goto("/chat");
  await page.locator("select").first().selectOption("class_1");
  await page.getByPlaceholder("Describe the image you want to generate").fill("Create a class promo post");
  await page.getByRole("button", { name: "Generate" }).click();

  await expect.poll(() => sessionCreated).toBe(true);
  await expect.poll(() => generatePayload?.sessionId).toBe("chat_created");
});
