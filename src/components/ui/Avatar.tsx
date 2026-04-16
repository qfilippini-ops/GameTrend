import Image from "next/image";

interface AvatarProps {
  src?: string | null;
  name?: string | null;
  size?: "sm" | "md" | "lg" | "xl";
  className?: string;
}

const sizes = {
  sm: { container: "w-8 h-8", text: "text-xs" },
  md: { container: "w-10 h-10", text: "text-sm" },
  lg: { container: "w-14 h-14", text: "text-lg" },
  xl: { container: "w-20 h-20", text: "text-2xl" },
};

const gradients = [
  "from-brand-600 to-ghost-600",
  "from-brand-500 to-blue-600",
  "from-ghost-600 to-pink-600",
  "from-emerald-500 to-brand-600",
  "from-orange-500 to-ghost-600",
];

function getGradient(name?: string | null): string {
  if (!name) return gradients[0];
  const index = name.charCodeAt(0) % gradients.length;
  return gradients[index];
}

export default function Avatar({ src, name, size = "md", className = "" }: AvatarProps) {
  const { container, text } = sizes[size];
  const initial = name?.charAt(0).toUpperCase() ?? "?";
  const gradient = getGradient(name);

  return (
    <div
      className={`${container} rounded-full overflow-hidden shrink-0 ${className}`}
    >
      {src ? (
        <div className="relative w-full h-full">
          <Image src={src} alt={name ?? "Avatar"} fill className="object-cover" />
        </div>
      ) : (
        <div
          className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${gradient} text-white font-bold ${text}`}
        >
          {initial}
        </div>
      )}
    </div>
  );
}
