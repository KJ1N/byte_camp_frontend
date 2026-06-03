import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import type { AuthenticatedUser, RequestWithUser } from "./auth.guard";

export const CurrentUser = createParamDecorator((data: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<RequestWithUser>();
  const user = request.user;

  if (!data) return user;
  return user?.[data];
});
