import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, Settings, Key, FileText, ShieldCheck, Activity, Server, HardDrive, ArrowRight } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface PlatformStat {
  id: string;
  label: string;
  value: string;
  icon: LucideIcon;
}

interface AdminSection {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  detail: string;
}

const platformStats: PlatformStat[] = [
  { id: "uptime", label: "Uptime", value: "99.9%", icon: Activity },
  { id: "active-users", label: "Active Users", value: "24", icon: Users },
  { id: "api-calls", label: "API Calls", value: "12.4k", icon: Server },
  { id: "storage", label: "Storage", value: "2.1 GB", icon: HardDrive },
];

const adminSections: AdminSection[] = [
  {
    id: "user-management",
    title: "User Management",
    description: "Manage user accounts, roles, permissions, and access controls across the platform",
    icon: Users,
    detail: "24 users",
  },
  {
    id: "system-settings",
    title: "System Settings",
    description: "Configure platform-wide settings, defaults, and operational parameters",
    icon: Settings,
    detail: "12 settings",
  },
  {
    id: "api-keys",
    title: "API Keys",
    description: "Generate and manage API keys for programmatic access and external integrations",
    icon: Key,
    detail: "8 active keys",
  },
  {
    id: "audit-logs",
    title: "Audit Logs",
    description: "Review system activity logs, user actions, and security events",
    icon: FileText,
    detail: "1.2k entries",
  },
];

export default function Admin() {
  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-admin">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <ShieldCheck className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Administration
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Platform configuration, user management, and system settings
            </p>
          </div>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3" data-testid="text-health-heading">
          Platform Health
        </h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {platformStats.map((stat) => {
            const IconComponent = stat.icon;
            return (
              <Card key={stat.id} data-testid={`card-stat-${stat.id}`}>
                <CardContent className="p-4 flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                    <IconComponent className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-lg font-semibold" data-testid={`text-stat-value-${stat.id}`}>
                      {stat.value}
                    </span>
                    <span className="text-xs text-muted-foreground" data-testid={`text-stat-label-${stat.id}`}>
                      {stat.label}
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {adminSections.map((section) => {
          const IconComponent = section.icon;
          return (
            <Card key={section.id} data-testid={`card-admin-${section.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                    <IconComponent className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-sm font-medium" data-testid={`text-admin-title-${section.id}`}>
                    {section.title}
                  </CardTitle>
                </div>
                <Badge variant="secondary" className="text-[10px]" data-testid={`badge-admin-detail-${section.id}`}>
                  {section.detail}
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground" data-testid={`text-admin-description-${section.id}`}>
                  {section.description}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  data-testid={`button-manage-${section.id}`}
                >
                  Manage
                  <ArrowRight className="w-3.5 h-3.5 ml-1.5" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
