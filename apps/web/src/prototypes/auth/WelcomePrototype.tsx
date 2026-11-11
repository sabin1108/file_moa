"use client";

import { useState } from "react";
import { AuthShell } from "../../components/layout/AuthShell";
import { ActionLink } from "../../components/ui/ActionLink";
import { DemoButton } from "../demo/DemoButton";
import styles from "../../components/layout/auth-shell.module.css";
import shared from "../demo/demo.module.css";

export function WelcomePrototype() {
  const [name, setName] = useState("sabin");
  const [acknowledged, setAcknowledged] = useState(false);

  return (
    <AuthShell preview>
      <div className={styles.form}>
        <h1>작업 공간을 준비할게요.</h1>
        <p>
          이름만 확인하고 시작하세요.
          <br />
          나머지 설정은 나중에 바꿀 수 있어요.
        </p>
        <label className={shared.field}>
          표시 이름
          <input
            maxLength={40}
            autoComplete="off"
            value={name}
            onChange={event => setName(event.target.value)}
          />
        </label>
        <div className={styles.dataNote}>
          <h3>내 자료는 이렇게 사용해요.</h3>
          <p>폴더 연결만으로 문서가 전송되지 않아요. 대화에 사용할 자료를 직접 고를 수 있어요.</p>
        </div>
        <label className={shared.check}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={event => setAcknowledged(event.target.checked)}
          />
          자료 사용 안내를 확인했어요.
        </label>
        {acknowledged && name.trim()
          ? (
            <ActionLink href="/preview/screens/chat" variant="primary" className={styles.start}>
              대화 시작하기
            </ActionLink>
          )
          : (
            <DemoButton variant="primary" disabled className={styles.start}>
              대화 시작하기
            </DemoButton>
          )}
        <ActionLink href="/preview/screens/login">로그인 화면으로</ActionLink>
      </div>
    </AuthShell>
  );
}
