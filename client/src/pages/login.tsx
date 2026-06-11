import { useState } from "react";
import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Shield, LogIn, UserPlus, AlertCircle } from "lucide-react";

export default function LoginPage() {
  const { login, register } = useAuth();
  const [isRegister, setIsRegister] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);

    const result = isRegister
      ? await register(username, password, email || undefined)
      : await login(username, password);

    if (!result.success) {
      setError(result.error || "Authentication failed");
    }
    setIsSubmitting(false);
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-background to-muted/30 p-4" data-testid="page-login">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 mb-4">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight" data-testid="text-app-title">ASTRA Agents</h1>
          <p className="text-sm text-muted-foreground">ASTRA Agents Platform</p>
        </div>

        <Card>
          <CardHeader className="space-y-1">
            <CardTitle className="text-xl">{isRegister ? "Create Account" : "Sign In"}</CardTitle>
            <CardDescription>
              {isRegister
                ? "Create your account to access the platform"
                : "Enter your credentials to continue"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive" data-testid="alert-login-error">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  data-testid="input-username"
                  placeholder="Enter username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  data-testid="input-password"
                  type="password"
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {isRegister && (
                <div className="space-y-2">
                  <Label htmlFor="email">Email (optional)</Label>
                  <Input
                    id="email"
                    data-testid="input-email"
                    type="email"
                    placeholder="you@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting} data-testid="button-login-submit">
                {isSubmitting ? (
                  "Please wait..."
                ) : isRegister ? (
                  <><UserPlus className="h-4 w-4 mr-2" /> Create Account</>
                ) : (
                  <><LogIn className="h-4 w-4 mr-2" /> Sign In</>
                )}
              </Button>

              <div className="text-center">
                <button
                  type="button"
                  className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
                  onClick={() => { setIsRegister(!isRegister); setError(""); }}
                  data-testid="button-toggle-register"
                >
                  {isRegister ? "Already have an account? Sign in" : "Need an account? Register"}
                </button>
              </div>
            </form>
          </CardContent>
        </Card>

        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-full border" data-testid="badge-security-mode">
            <Shield className="h-3 w-3" />
            Production Mode — Authentication Required
          </span>
        </div>
      </div>
    </div>
  );
}
