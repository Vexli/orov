# @orov/integrations

Provider-neutral interfaces for the tools OrOv can connect to, the registry that chooses a provider
from the environment, in-memory fakes, and contract test suites.

| File                         | What it holds                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------- |
| `types.ts`                   | The vendor-neutral shapes providers return                                       |
| `messaging.ts`               | `MessagingProvider`: user matching, chat links, group chats, status channel      |
| `calendar.ts`                | `CalendarProvider`: out-of-office and working-location events                    |
| `rooms.ts`                   | `RoomProvider`: room directory and busy times                                    |
| `registry.ts`                | `MESSAGING_PROVIDER`, `CALENDAR_PROVIDER`, `ROOMS_PROVIDER`, `INTEGRATIONS=fake` |
| `fakes/`                     | Deterministic in-memory providers that match the demo seed                       |
| `contract/`                  | `describe()` suites every provider's tests must pass                             |
| `providers/<id>/` (none yet) | A real adapter, the only place a vendor's name or SDK may appear                 |

No real provider ships in this release. The architecture, the data-flow rules and the checklist for
adding a provider are in [`docs/integrations/README.md`](../../docs/integrations/README.md).

```sh
pnpm --filter @orov/integrations test
```
