"use client";

import { useState, type ChangeEventHandler, type FocusEventHandler, type KeyboardEventHandler } from "react";
import type { Field } from "../lib/form-config";
import styles from "../../../components/layout/auth-shell.module.css";

export function AuthInput({ field, error, value, onChange, onBlur, onKeyDown }: {
  field: Field;
  error?: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  onBlur?: FocusEventHandler<HTMLInputElement>;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}) {
  const [visible, setVisible] = useState(false);
  const password = field.type === "password";
  const id = `auth-${field.name}`;

  return <div className={styles.field}>
    <label htmlFor={id}>
      {field.label}
    </label>
    <div className={password ? styles.passwordControl : undefined}>
      <input
        id={id}
        name={field.name}
        type={password && visible ? "text" : field.type}
        required
        autoComplete={field.autoComplete}
        minLength={field.minLength}
        maxLength={field.maxLength}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `error-${field.name}` : undefined}
        {...value === undefined ? {} : { value, onChange }}
        onBlur={onBlur}
        onKeyDown={onKeyDown}
      />
      {password && <button
        type="button"
        className={styles.passwordToggle}
        aria-controls={id}
        aria-pressed={visible}
        aria-label={`${field.label} ${visible ? "숨기기" : "보기"}`}
        onClick={() => setVisible(previous => !previous)}
      >
        {visible ? "숨기기" : "보기"}
      </button>}
    </div>
    {error && <span id={`error-${field.name}`} className={styles.fieldError}>
      {error}
    </span>}
  </div>;
}
