# Admin Console + Workspace Lite Plan

## Goal

Loom needs a platform admin layer that separates company, personal, and small-team usage without exposing workspace switching to normal users.

The product principle is:

- Platform owners can see and control every workspace.
- Company workspace admins can manage only their company workspace later.
- Normal users enter Loom directly and should not see public/private/workspace choices.
- Feishu login users are automatically routed into the configured company workspace.
- Platform owner/admin users, including a password account such as Graham, are also added as admins of the configured company workspace.
- Password/manual users stay unassigned until a platform owner assigns them to a workspace.

## Workspace Model

Core tables:

- `workspaces`: workspace identity, type, status, and default AI policy.
- `workspace_members`: membership, role, status, and default workspace marker.

Initial workspace types:

- `company`: company/team workspace, currently auto-created for Feishu users.
- `personal`: owner-only personal workspace, assigned manually for now.
- `small_team`: girlfriend/friends startup team workspace, assigned manually.
- `system`: reserved for visitor/sample behavior if needed.

## Admin Console V0.2

Platform Admin Console should include:

- Dashboard: user count, active users, workspace count, unassigned users, and data totals.
- Workspaces: list workspace slug/name/type, AI policy, members, and data counts.
- Users: existing role/status/signout tools plus workspace assignment.

Current implementation keeps the normal Loom UI unchanged. Workspace routing is admin-visible first.

## Data Separation Path

Current data still mostly belongs to `user_id`.

Migration path:

1. Add workspace tables and admin visibility.
2. Add `workspace_id` shadow columns to `news_sources` and `news_items`.
3. Keep password/manual users unassigned until explicitly assigned.
4. Auto-assign Feishu users to `LOOM_FEISHU_WORKSPACE_SLUG` or `company`.
5. Move News/Sources writes to workspace-aware ownership.
6. Move Products/Demands/Research/Settings from `state:user:{userId}` toward `state:workspace:{workspaceId}`.
7. Add workspace-scoped export for company handoff.

## Sealed Repository Layout

Recommended private layout:

```text
sealed/
  config/
    platform/
    workspaces/
      company/
      personal/
      gf-team/
  exports/
    company/
    personal/
    gf-team/
  runbooks/
    export-workspace-data.md
    deploy.md
```

Company exports should include only data for the company workspace and must exclude personal, small-team, platform API keys, and unrelated deployment secrets.

## References

The model borrows the lightweight shape of `User / Workspace / Member` from Nextacular and the team-admin product boundary from Cal.com, adapted to Loom's existing Express + SQLite stack.
