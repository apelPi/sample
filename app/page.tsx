import ChatGPTMobile from "./ChatGPTMobile";
import { auth0 } from '../lib/auth0';

export default async function Page() {
  const session = await auth0.getSession();
  return (
    <ChatGPTMobile user={session?.user} isLoggedIn={!!session} />
  );
}
