import { redirect } from "next/navigation";

// proxy.ts redirects `/` before it renders; this only covers a request that
// somehow reaches the page without passing through it.
export default function Root() {
  redirect("/home");
}
