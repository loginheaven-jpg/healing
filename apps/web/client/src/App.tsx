import { useEffect, useState } from "react";

/**
 * P0 의 골격 화면입니다.
 *
 * 실제 화면은 시안대로 만듭니다 — 서재·연습은 P4, 올리기·인식 확인은 P5.
 * 지금은 클라이언트와 서버가 이어졌는지만 보여 줍니다.
 * 시안에 없는 화면 요소를 여기에 더하지 마십시오.
 */
export function App() {
  const [health, setHealth] = useState<"확인 중" | "연결됨" | "연결되지 않음">("확인 중");

  useEffect(() => {
    let alive = true;
    fetch("/health")
      .then((r) => (r.ok ? "연결됨" : "연결되지 않음"))
      .catch(() => "연결되지 않음" as const)
      .then((s) => {
        if (alive) setHealth(s as typeof health);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh max-w-[430px] flex-col justify-center gap-3 px-6">
      <h1 className="font-title text-3xl text-ink">힐링콰이어</h1>
      <p className="text-ink-70">성가대 파트 연습 도구입니다.</p>
      <p className="font-mono text-sm text-ink-45">서버 {health}</p>
    </main>
  );
}
