import type { ActionFunctionArgs } from "react-router";
import { destroyTokenSession } from "~/lib/tapis.server";

export async function action({ request }: ActionFunctionArgs) {
  return destroyTokenSession(request);
}