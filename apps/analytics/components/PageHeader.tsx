export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between border-b pb-6 mb-8" style={{ borderColor: "#E5E7EB" }}>
      <div>
        <h1 className="text-2xl font-bold text-[#00001F] tracking-tight">{title}</h1>
        {subtitle && (
          <p className="text-sm text-[#7A7B9A] mt-1.5 max-w-2xl">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Section({ title, description, children, className = "" }: { title?: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`mb-10 ${className}`}>
      {title && (
        <div className="mb-4">
          <h2 className="text-base font-bold text-[#00001F]">{title}</h2>
          {description && <p className="text-sm text-[#7A7B9A] mt-1">{description}</p>}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatCard({
  label,
  value,
  sub,
  trend,
  variant = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: { value: string; direction: "up" | "down" };
  variant?: "default" | "warning" | "success" | "danger" | "brand";
}) {
  const valueColor = {
    default: "#00001F",
    warning: "#D97706",
    success: "#16A34A",
    danger: "#DC2626",
    brand: "#2351DC",
  }[variant];

  return (
    <div className="bg-white border rounded-xl p-5" style={{ borderColor: "#E5E7EB" }}>
      <p className="text-xs font-medium text-[#7A7B9A] uppercase tracking-wide">{label}</p>
      <div className="flex items-baseline gap-2 mt-2">
        <p className="text-2xl font-extrabold leading-none" style={{ color: valueColor }}>
          {value}
        </p>
        {trend && (
          <span className={`text-xs font-semibold ${trend.direction === "up" ? "text-green-600" : "text-red-600"}`}>
            {trend.direction === "up" ? "↑" : "↓"} {trend.value}
          </span>
        )}
      </div>
      {sub && <p className="text-xs text-[#7A7B9A] mt-1.5">{sub}</p>}
    </div>
  );
}

export function Card({ children, className = "", style }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`bg-white border rounded-xl ${className}`} style={{ borderColor: "#E5E7EB", ...style }}>
      {children}
    </div>
  );
}

export function CardHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b" style={{ borderColor: "#E5E7EB" }}>
      <h3 className="text-sm font-bold text-[#00001F]">{title}</h3>
      {action}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "brand" | "success" | "warning" | "danger" | "info" }) {
  const styles = {
    neutral: "bg-gray-100 text-gray-700",
    brand: "bg-[#E8EAFB] text-[#2351DC]",
    success: "bg-green-100 text-green-800",
    warning: "bg-amber-100 text-amber-800",
    danger: "bg-red-100 text-red-700",
    info: "bg-blue-100 text-blue-800",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[0.68rem] font-semibold ${styles[tone]}`}>
      {children}
    </span>
  );
}
