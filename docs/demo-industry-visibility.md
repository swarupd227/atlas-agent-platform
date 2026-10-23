# Per-user industry visibility demo

This custom-branch feature is for the AWS monorepo Dev demonstration. It changes industry choices in the UI, not API authorization or data isolation. Client labels are descriptive; accounts share the existing workspace.

## Administration

Sign in as the existing platform administrator, open **Administration → Demo Users**, and choose **Edit industries** beside a real login account. Select any registered industries, choose an included default, and save. The screen can also create real non-admin `agent_engineer` login accounts; account creation does not replace the administrator's session.

Enable **Use each user's selected industries** after assigning accounts. Administrators retain all industries. Unassigned users see an administrator-contact notice, with a sign-out action. Users load changes when they refresh or focus the browser. Invalid saved selections fall back to the assigned default.

Assignments are separate `platform_settings` entries named `DEMO_INDUSTRY_USER:<user-id>`. `DEMO_INDUSTRY_VISIBILITY` enables the feature. No schema migration is required, and no client name or industry selection is hardcoded.

## Rollback

**Reset to normal visibility** disables the feature immediately without removing accounts or assignments. An application rollback uses the previous immutable Dev ECR image digest with the existing `deploy/aws/operate.sh deploy-image --deployment-id demo --digest <previous-digest>` operation. Accounts remain real login accounts after either rollback.

## Deployment boundary

The custom branch `demo/hilti-industry-visibility` must pass CI. Its image workflow accepts only its current tested commit and deployment ID `demo`. A separate OIDC role can push only to `astra-agents-demo-app`; the existing production role and main-branch source rule are retained. Do not deploy this branch to Azure or AWS Production.

## Verification

Unit coverage lives in `tests/demo-industry-visibility.test.ts` and `tests/demo-users.test.ts`, explicitly registered in CI. Browser verification lives in `tests/demo-industry-visibility.e2e.ts`; supply the private credential artifact using `E2E_DEMO_CREDENTIALS_FILE` and the Dev administrator password through `E2E_ADMIN_PASSWORD`, with `E2E_BASE_URL` explicitly set to AWS Dev. The browser checks do not create extra login accounts or change the assignments.
