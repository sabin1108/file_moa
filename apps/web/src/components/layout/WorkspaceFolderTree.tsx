"use client";
import { useState } from "react";
import { Icon } from "../ui/Icon";
import styles from "../../styles/sidebar.module.css";

export type WorkspaceFolderNode = Readonly<{ path: readonly string[]; label: string }>;
export function WorkspaceFolderTree({ title, nodes, currentPath, onOpen, disabled = false }: {
  title: string; nodes: readonly WorkspaceFolderNode[]; currentPath: readonly string[]; onOpen: (path: readonly string[]) => void; disabled?: boolean;
}) {
  const [opened, setOpened] = useState<Set<string>>(() => new Set(["[]"]));
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set());
  const expanded = new Set([...opened, ...currentPath.map((_part, index) => JSON.stringify(currentPath.slice(0, index + 1)))].filter(key => !collapsed.has(key)));
  const childrenOf = (path: readonly string[]) => nodes.filter(node => node.path.length === path.length + 1 && path.every((part, index) => node.path[index] === part));
  const renderNode = (node: WorkspaceFolderNode) => {
      const key = JSON.stringify(node.path);
      const children = childrenOf(node.path);
      const hasChildren = children.length > 0;
      const active = key === JSON.stringify(currentPath);
      return (
        <li key={key} data-folder-path={key}>
          <div className={styles.treeRow}>
            {hasChildren ? (
              <button
                type="button"
                className={styles.expandFolder}
                disabled={disabled}
                aria-label={`${node.label} 하위 폴더 ${expanded.has(key) ? "접기" : "펼치기"}`}
                aria-expanded={expanded.has(key)}
                onClick={() => {
                  if (expanded.has(key)) setCollapsed(previous => new Set(previous).add(key));
                  else {
                    setOpened(previous => new Set(previous).add(key));
                    setCollapsed(previous => {
                      const next = new Set(previous);
                      next.delete(key);
                      return next;
                    });
                  }
                }}
              >
                <Icon name="chevron" size={12} />
              </button>
            ) : (
              <span className={styles.treeSpacer} />
            )}
            <button
              type="button"
              className={styles.treeFolder}
              title={node.path.join(" / ") || node.label}
              aria-disabled={disabled || undefined}
              aria-current={active ? "location" : undefined}
              data-folder-tree-root={node.path.length === 0 ? true : undefined}
              onClick={() => {
                if (disabled) return;
                setOpened(previous => new Set([...previous, key]));
                setCollapsed(new Set());
                onOpen(node.path);
              }}
            >
              <Icon name="folder" size={16} />
              <span>{node.label}</span>
            </button>
          </div>
          {hasChildren && expanded.has(key) && <ul>{children.map(renderNode)}</ul>}
        </li>
      );
  };
  return <section className={styles.connectedTree} aria-label="연결 폴더 구조"><h2>{title}</h2><ul>{nodes.filter(node => node.path.length === 0).map(renderNode)}</ul></section>;
}
