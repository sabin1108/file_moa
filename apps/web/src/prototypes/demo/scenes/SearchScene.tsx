"use client";

import Link from "next/link";
import { useState } from "react";
import { Icon } from "../../../components/ui/Icon";
import { recentConversations, previousConversations } from "../../prototype-data";
import styles from "../demo.module.css";
import layout from "../scene-layout.module.css";

export function SearchScene() {
  const [query, setQuery] = useState("");
  const groups = [
    { name: "최근 대화", titles: recentConversations.map(item => item.title) },
    { name: "이전 대화", titles: previousConversations },
  ].map(group => ({
    ...group,
    titles: group.titles.filter(title => title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()))
  }));
  const count = groups.reduce((sum, group) => sum + group.titles.length, 0);

  return (
    <div>
      <div className={layout.searchBar}>
        <label className={styles.field}>
          대화 제목
          <input
            autoComplete="off"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="기억나는 단어로 찾아보세요"
          />
        </label>
        <span role="status">{count}개 대화</span>
      </div>
      {count
        ? (
          groups
            .filter(group => group.titles.length)
            .map(group => (
              <section className={layout.conversationGroup} key={group.name}>
                <h3>
                  {group.name}
                </h3>
                <ul>
                  {group.titles.map(title => (
                    <li key={title}>
                      <Link href="/">
                        <span>
                          <Icon name="chat" size={18} />
                          {title}
                        </span>
                        <small>대화 열기 →</small>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))
        )
        : (
          <div className={layout.conversationGroup}>
            <h3>검색 결과</h3>
            <div>
              <p>일치하는 대화가 없어요.</p>
              <p className={styles.note}>다른 단어로 찾아보세요.</p>
            </div>
          </div>
        )}
      <p className={styles.note} style={{ marginTop: 24 }}>
        샘플 제목을 검색합니다. 결과를 누르면 현재 대화 시안으로 돌아갑니다.
      </p>
    </div>
  );
}
