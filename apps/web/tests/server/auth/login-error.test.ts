import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import LoginError from "../../../src/app/login/error";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push() {} }) }));

it("offers authentication recovery without exposing the server error or pretending to be logged in", () => {
  const html = renderToStaticMarkup(createElement(LoginError, { error: new Error("private-db-password-token"), reset() {} }));
  expect(html).toContain('role="alert"');
  expect(html).toContain("다시 시도");
  expect(html).toContain('href="/demo"');
  expect(html).not.toContain("private-db-password-token");
  expect(html).not.toContain('type="password"');
});
