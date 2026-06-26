import { motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useNotifications } from "@/hooks/use-notifications";
import { useLocation } from "wouter";

export function NotificationBell({ isAuthenticated = false }: { isAuthenticated?: boolean }) {
  const [, setLocation] = useLocation();
  const { unreadCount } = useNotifications(isAuthenticated);

  return (
    <button
      onClick={() => setLocation("/profile/notifications")}
      className="w-10 h-10 rounded-full bg-card border border-card-border flex items-center justify-center text-foreground relative hover:bg-secondary transition-colors"
    >
      <motion.div
        animate={unreadCount > 0 ? { rotate: [0, -15, 15, -10, 10, 0] } : {}}
        transition={{ duration: 0.5, repeat: unreadCount > 0 ? Infinity : 0, repeatDelay: 4 }}
      >
        <Bell className="w-[18px] h-[18px]" />
      </motion.div>
      {unreadCount > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 border-2 border-card rounded-full text-[9px] font-bold text-white flex items-center justify-center px-1"
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </motion.span>
      )}
    </button>
  );
}
