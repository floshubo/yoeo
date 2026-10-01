import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { icons, imageFor, groupFor } from "./data";
import type { Preference } from "./types";
import { useI18n } from './i18n';
export function Icon({
  name,
  size = 24,
}: {
  name: keyof typeof icons;
  size?: number;
}) {
  return (
    <img className="icon" alt="" src={icons[name]} width={size} height={size} />
  );
}
export function IconButton({
  name,
  label,
  onClick,
}: {
  name: keyof typeof icons;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="icon-button"
      aria-label={label}
      onClick={onClick}
    >
      <Icon name={name} />
    </button>
  );
}
export function Button({
  children,
  onClick,
  secondary = false,
  disabled = false,
  danger = false,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  secondary?: boolean;
  disabled?: boolean;
  danger?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      className={`button ${secondary ? "secondary" : ""} ${danger ? "danger" : ""}`}
      disabled={disabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
export function Badge({ value }: { value: string }) {
  const {t}=useI18n();
  return <span className={`badge ${value.toLowerCase()}`}>{t(value)}</span>;
}
export function AllergenRow({
  item,
  onClick,
}: {
  item: Preference;
  onClick?: () => void;
}) {
  const {t}=useI18n();
  const content = (
    <>
      <img src={imageFor(item.name, item.severity)} width="60" height="60" alt="" />
      <span className="allergen-label">
        <span>{t(item.name)}</span>
        <small>{t(groupFor(item.name))}</small>
      </span>
      <Badge value={item.severity} />
    </>
  );
  return onClick ? (
    <button
      className={`allergen-row ${item.severity.toLowerCase()}`}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <div className={`allergen-row ${item.severity.toLowerCase()}`}>
      {content}
    </div>
  );
}
/** Shared profile navigation layout from the component library. */
export function ProfileList({icon,children,onClick}:{icon:keyof typeof icons;children:ReactNode;onClick:()=>void}) {
  return <button type="button" className="profile-link" onClick={onClick}><Icon name={icon}/><strong>{children}</strong></button>;
}
export function Topbar({
  title,
  onBack,
  onClose,
  dark = false,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  dark?: boolean;
}) {
  const {t}=useI18n();
  return (
    <header className={`topbar ${dark ? "dark" : ""}`}>
      <span>
        {onBack && <IconButton name="back" label={t('Go back')} onClick={onBack} />}
      </span>
      <h1>{title}</h1>
      <span>
        {onClose && <IconButton name="close" label={t('Close')} onClick={onClose} />}
      </span>
    </header>
  );
}
export function Avatar({src,size=60}:{src?:string;size?:number}) {
  const {t}=useI18n();
  return <span className="generic-avatar" style={{width:size,height:size}}>{src ? <img src={src} alt={t('Profile photo')} width={size} height={size}/> : <Icon name="profileActive" size={Math.round(size*.52)}/>}</span>;
}
export function Brand({ onProfile, avatar }: { onProfile: () => void; avatar?:string }) {
  const {t}=useI18n();
  return (
    <header className="brand">
      <img src="/assets/final-ui/logoWhiteSmall.svg" alt="YOEO" width="32" height="24" />
      <button
        className="avatar-button"
        onClick={onProfile}
        aria-label={t('Open profile')}
      >
        <Avatar src={avatar} size={24}/>
      </button>
    </header>
  );
}
export function Navigation({
  active,
  onChange,
}: {
  active: string;
  onChange: (s: string) => void;
}) {
  const {t}=useI18n();
  return (
    <nav className="bottom-nav" aria-label={t('Main navigation')}>
      {(["home", "allergens", "profile"] as const).map((n) => (
        <button
          key={n}
          aria-current={active === n ? "page" : undefined}
          className={active === n ? "active" : ""}
          onClick={() => onChange(n)}
        >
          <Icon name={active === n ? `${n}Active` : n} />
          <span>{t(n[0].toUpperCase() + n.slice(1))}</span>
        </button>
      ))}
    </nav>
  );
}
export function Modal({
  children,
  onClose,
  label,
  sheet = false,
}: {
  children: ReactNode;
  onClose: () => void;
  label: string;
  sheet?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const back = (event: Event) => {
      if (ref.current?.offsetParent === null) return;
      event.preventDefault(); onClose();
    };
    document.addEventListener('yoeo:back', back);
    const first = ref.current?.querySelector<HTMLElement>(
      "button,input,select",
    );
    first?.focus();
    const handle = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),input,select,[tabindex="0"]',
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handle);
    return () => {
      document.removeEventListener("keydown", handle);
      document.removeEventListener('yoeo:back', back);
      previous?.focus();
    };
  }, [onClose]);
  return (
    <div
      className={`overlay ${sheet ? "sheet-overlay" : ""}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={label}
        className={sheet ? "sheet" : "modal"}
        ref={ref}
      >
        {children}
      </div>
    </div>
  );
}
