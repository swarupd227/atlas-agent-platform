import { useRole } from "@/components/role-provider";
import { User, Bell, Monitor } from "lucide-react";

export default function BusinessSettings() {
  const { role } = useRole();

  return (
    <div className="flex flex-col gap-5 p-6 max-w-xl" data-testid="page-business-settings">
      <div>
        <h1 className="text-xl font-semibold tracking-tight" data-testid="text-settings-title">Settings</h1>
        <p className="text-sm text-muted-foreground">Account and workspace preferences</p>
      </div>

      <div className="rounded-lg border bg-card divide-y">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Account</p>
            <p className="text-xs text-muted-foreground">Viewing as: {role.label}</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Bell className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">Notifications</p>
            <p className="text-xs text-muted-foreground">Email and in-app notification preferences</p>
          </div>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
            <Monitor className="w-4 h-4 text-primary" />
          </div>
          <div>
            <p className="text-sm font-medium">View mode</p>
            <p className="text-xs text-muted-foreground">Currently in Business Mode — simplified view</p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Full settings configuration is available in the advanced views. Use the mode switcher in the sidebar to access additional settings.
      </p>
    </div>
  );
}
