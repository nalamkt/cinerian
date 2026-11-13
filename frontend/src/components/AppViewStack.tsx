import type { ReactNode } from "react";
import type { AppView } from "../lib/access";

type AppViewStackProps = {
  activeView: AppView;
  showProfile: boolean;
  feed: ReactNode;
  recommendations?: ReactNode;
  inbox?: ReactNode;
  user: ReactNode;
  profile?: ReactNode;
};

export function AppViewStack({
  activeView,
  showProfile,
  feed,
  recommendations,
  inbox,
  user,
  profile
}: AppViewStackProps) {
  const isHidden = (view: AppView) => showProfile || activeView !== view;

  return (
    <>
      {recommendations != null ? <div hidden={isHidden("recommendations")}>{recommendations}</div> : null}
      <div hidden={isHidden("feed")}>{feed}</div>
      {inbox != null ? <div hidden={isHidden("inbox")}>{inbox}</div> : null}
      <div hidden={showProfile || (activeView !== "user" && activeView !== "watching")}>{user}</div>
      {showProfile ? profile : null}
    </>
  );
}
