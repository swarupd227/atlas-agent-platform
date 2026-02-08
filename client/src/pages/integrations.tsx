import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, Database, BarChart3, GitBranch, Ticket, MessageSquare, Plug } from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface IntegrationCategory {
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  count: number;
}

const integrationCategories: IntegrationCategory[] = [
  {
    id: "llm-providers",
    name: "LLM Providers",
    description: "Connect large language model providers for agent reasoning and generation capabilities",
    icon: Brain,
    count: 4,
  },
  {
    id: "vector-databases",
    name: "Vector Databases",
    description: "Integrate vector storage solutions for semantic search and retrieval-augmented generation",
    icon: Database,
    count: 3,
  },
  {
    id: "monitoring",
    name: "Monitoring",
    description: "Set up observability and monitoring tools to track agent performance and health",
    icon: BarChart3,
    count: 5,
  },
  {
    id: "ci-cd",
    name: "CI/CD",
    description: "Configure continuous integration and deployment pipelines for agent releases",
    icon: GitBranch,
    count: 3,
  },
  {
    id: "ticketing",
    name: "Ticketing",
    description: "Connect ticketing systems for issue tracking and workflow automation",
    icon: Ticket,
    count: 4,
  },
  {
    id: "communication",
    name: "Communication",
    description: "Integrate messaging and communication platforms for agent interactions",
    icon: MessageSquare,
    count: 6,
  },
];

export default function Integrations() {
  return (
    <div className="flex flex-col gap-6 p-6" data-testid="page-integrations">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center justify-center w-9 h-9 rounded-md bg-primary/10 shrink-0">
            <Plug className="w-4 h-4 text-primary" />
          </div>
          <div className="flex flex-col gap-0.5">
            <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-page-title">
              Integrations
            </h1>
            <p className="text-sm text-muted-foreground" data-testid="text-page-subtitle">
              Connect external tools, APIs, and services to your agent platform
            </p>
          </div>
        </div>
        <Badge variant="outline" className="text-xs" data-testid="badge-category-count">
          {integrationCategories.length} categories
        </Badge>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {integrationCategories.map((category) => {
          const IconComponent = category.icon;
          return (
            <Card key={category.id} data-testid={`card-integration-${category.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-2 space-y-0 pb-2">
                <div className="flex items-center gap-3">
                  <div className="flex items-center justify-center w-9 h-9 rounded-md bg-muted shrink-0">
                    <IconComponent className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <CardTitle className="text-sm font-medium" data-testid={`text-integration-name-${category.id}`}>
                    {category.name}
                  </CardTitle>
                </div>
                <Badge variant="secondary" className="text-[10px]" data-testid={`badge-integration-count-${category.id}`}>
                  {category.count} available
                </Badge>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                <p className="text-xs text-muted-foreground" data-testid={`text-integration-description-${category.id}`}>
                  {category.description}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-fit"
                  data-testid={`button-configure-${category.id}`}
                >
                  Configure
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
