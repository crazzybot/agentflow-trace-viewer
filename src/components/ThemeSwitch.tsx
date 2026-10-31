import { Monitor, Moon, Sun } from "lucide-react";
import { useThemePref, type ThemePref } from "../utils/theme";

const OPTIONS: { value: ThemePref; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System theme", Icon: Monitor },
  { value: "light", label: "Light theme", Icon: Sun },
  { value: "dark", label: "Dark theme", Icon: Moon },
];

/** System / Light / Dark switch; the choice is stored and applied via <html data-theme>. */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const [pref, setPref] = useThemePref();
  return (
    <div role="group" aria-label="Theme" className={`theme-switch ${className}`}>
      {OPTIONS.map(({ value, label, Icon }) => (
        <button
          key={value}
          type="button"
          className="theme-switch-btn"
          aria-pressed={pref === value}
          aria-label={label}
          title={label}
          onClick={() => setPref(value)}
        >
          <Icon className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}
