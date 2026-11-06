import type { ChangeEventHandler, FocusEventHandler, KeyboardEventHandler } from "react";
import type { Field } from "../lib/form-config";
import styles from "../../../components/layout/auth-shell.module.css";

export function AuthInput({ field, error, value, onChange, onBlur, onKeyDown }: {
  field: Field; error?: string; value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>; onBlur?: FocusEventHandler<HTMLInputElement>; onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
}) {
  return <label className={styles.field} htmlFor={`auth-${field.name}`}>
    {field.label}
    <input id={`auth-${field.name}`} name={field.name} type={field.type} required autoComplete={field.autoComplete}
      minLength={field.minLength} maxLength={field.maxLength} aria-invalid={error ? true : undefined} aria-describedby={error ? `error-${field.name}` : undefined}
      {...value === undefined ? {} : { value, onChange }} onBlur={onBlur} onKeyDown={onKeyDown} />
    {error && <span id={`error-${field.name}`} className={styles.fieldError}>{error}</span>}
  </label>;
}
