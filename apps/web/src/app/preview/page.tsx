import Link from "next/link";
import { ActionLink } from "../../components/ui/ActionLink";
import { Icon } from "../../components/ui/Icon";
import { scenes, sceneIds } from "../../prototypes/demo/scene-data";
import styles from "../../prototypes/demo/demo.module.css";
import { WorkspaceSidebar } from "../../prototypes/components/WorkspaceSidebar";
import ui from "../../styles/workspace-ui.module.css";

export default function Page() {
  const groups = [...new Set(sceneIds.map(id => scenes[id].group))];
  return (
    <div className={`${ui.system} ${ui.workspace}`}>
      <WorkspaceSidebar showHistory={false} active="files" />
      <main className={ui.main}>
        <header className={ui.topbar}>
          <h1>화면 둘러보기</h1>
          <nav>
            <ActionLink href="/">대화</ActionLink>
            <ActionLink href="/files">내 폴더</ActionLink>
            <ActionLink href="/settings">설정</ActionLink>
          </nav>
        </header>
        <div className={ui.canvas}>
          <div className={`${ui.sheet} ${styles.catalogSheet}`} data-layout="reader">
            <p className={styles.note}>디자인과 화면 흐름을 확인하는 샘플입니다.</p>
            <section className={styles.catalogGroup}>
              <h2>보관한 전체 화면 시안</h2>
              <div className={styles.catalog}>
                {[
                  ["/preview/screens/chat", "대화", "예시 대화와 입력창 디자인"],
                  ["/preview/screens/chat-first", "대화 중심 정리 개편안", "대화 안의 확인 질문과 현재·도착 폴더 비교"],
                  ["/preview/screens/files", "내 폴더", "합성 파일 목록과 정리 계획"],
                  ["/preview/screens/login", "로그인", "소셜 계정으로 시작하는 진입 화면"],
                  ["/preview/screens/welcome", "첫 가입 안내", "기본 정보와 자료 사용 안내"],
                  ["/preview/screens/settings", "설정", "계정 · 답변 · 연결 폴더 · 데이터"],
                ].map(([href, title, detail]) => (
                  <Link key={href} href={href}>
                    <div>
                      {title}
                      <p>{detail}</p>
                    </div>
                    <Icon name="chevron" size={16} />
                  </Link>
                ))}
              </div>
            </section>
            {groups.map(group => (
              <section className={styles.catalogGroup} key={group}>
                <h2>{group}</h2>
                <div className={styles.catalog}>
                  {sceneIds
                    .filter(id => scenes[id].group === group)
                    .map(id => (
                      <Link href={"/preview/" + id} key={id}>
                        <div>
                          {scenes[id].title}
                          <p>{scenes[id].description}</p>
                        </div>
                        <Icon name="chevron" size={16} />
                      </Link>
                    ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
