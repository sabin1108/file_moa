import { expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { sendAuthenticationEmail } from "../../src/server/auth-mail";

process.loadEnvFile(".env.local");

it("Resend accepts the two explicitly requested delivery-test emails without changing an account", async () => {
  const to = process.env.MOA_MAIL_TEST_RECIPIENT;

  if (!to) throw new Error("An explicitly authorized test recipient is required.");

  for (const kind of ["이메일 인증", "비밀번호 재설정"]) {
    const receipt = await sendAuthenticationEmail({
      to,
      subject: `[모아 발송 테스트] ${kind}`,
      text: `요청하신 모아 ${kind} 메일 발송 경로 확인용 메시지입니다.\n\n실제 서비스와 동일한 메일 전송 코드로 보냈습니다. 이 테스트는 계정을 생성하거나 비밀번호를 변경하지 않으며, 클릭할 인증 링크도 포함하지 않습니다.\n\n메일 접수 확인과 실제 수신 확인은 별도로 구분합니다.`,
    });

    expect(receipt.id.length > 0).toBe(true);
  }
}, 30_000);
