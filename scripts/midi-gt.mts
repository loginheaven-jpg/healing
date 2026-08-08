/**
 * LilyPond 가 낸 MIDI 에서 픽스처 정답(ground truth)을 뽑는다.
 *
 * **정답은 손으로 적지 않는다.** 조판 프로그램이 확정한 값을 그대로 쓴다.
 * "내가 정답이라고 생각한 것"과 "조판이 실제로 만든 것"이 다르면 시험이
 * 시험 구실을 못 한다.
 *
 * 기존 픽스처는 python + music21 로 정답을 만들었다(gen_three_gt.py).
 * 이 스크립트는 같은 일을 의존성 없이 한다. 감리자가 파이썬 환경을
 * 갖추지 않고도 정답을 재생성해 대조할 수 있어야 하기 때문이다.
 *
 * 실행:
 *   pnpm midi-gt <파일.mid> <파트이름...>
 *   pnpm midi-gt packages/omr-vector/fixtures/tenor_octave.mid Soprano Alto Tenor Bass
 */

import fs from "node:fs";

type Track = { notes: { midi: number; tick: number }[] };

/** 가변 길이 정수 (MIDI 표준 varint) */
function readVarInt(buf: Buffer, pos: number): [value: number, next: number] {
  let value = 0;
  let p = pos;
  for (;;) {
    const b = buf[p++]!;
    value = (value << 7) | (b & 0x7f);
    if ((b & 0x80) === 0) break;
  }
  return [value, p];
}

function parseTrack(buf: Buffer, start: number, length: number): Track {
  const notes: { midi: number; tick: number }[] = [];
  let p = start;
  const end = start + length;
  let tick = 0;
  let running = 0;

  while (p < end) {
    const [delta, afterDelta] = readVarInt(buf, p);
    p = afterDelta;
    tick += delta;

    let status = buf[p]!;
    if (status & 0x80) p++;
    else status = running; // 러닝 스테이터스: 상태 바이트를 생략한 이벤트
    if (status & 0x80 && status < 0xf0) running = status;

    if (status === 0xff) {
      // 메타 이벤트
      p++; // type
      const [len, afterLen] = readVarInt(buf, p);
      p = afterLen + len;
    } else if (status === 0xf0 || status === 0xf7) {
      const [len, afterLen] = readVarInt(buf, p);
      p = afterLen + len;
    } else {
      const type = status & 0xf0;
      const d1 = buf[p++]!;
      // 프로그램 체인지와 채널 압력만 데이터가 1바이트다
      const d2 = type === 0xc0 || type === 0xd0 ? 0 : buf[p++]!;
      // 속도 0인 note-on 은 note-off 다
      if (type === 0x90 && d2 > 0) notes.push({ midi: d1, tick });
    }
  }

  notes.sort((a, b) => a.tick - b.tick || a.midi - b.midi);
  return { notes };
}

function parseMidi(file: string): Track[] {
  const buf = fs.readFileSync(file);
  if (buf.toString("ascii", 0, 4) !== "MThd") throw new Error(`MIDI 파일이 아닙니다: ${file}`);

  const tracks: Track[] = [];
  let p = 8 + buf.readUInt32BE(4); // 헤더 청크를 건너뛴다

  while (p + 8 <= buf.length) {
    const id = buf.toString("ascii", p, p + 4);
    const len = buf.readUInt32BE(p + 4);
    if (id === "MTrk") tracks.push(parseTrack(buf, p + 8, len));
    p += 8 + len;
  }
  return tracks;
}

const [file, ...partNames] = process.argv.slice(2);
if (!file || partNames.length === 0) {
  console.error("사용법: pnpm midi-gt <파일.mid> <파트이름...>");
  process.exit(1);
}

const tracks = parseMidi(file).filter((t) => t.notes.length > 0);

if (tracks.length !== partNames.length) {
  console.error(
    `음표가 있는 트랙이 ${tracks.length}개인데 파트 이름은 ${partNames.length}개입니다.`,
  );
  tracks.forEach((t, i) => console.error(`  트랙${i}: ${t.notes.length}음`));
  process.exit(1);
}

const gt = Object.fromEntries(
  partNames.map((name, i) => [name, tracks[i]!.notes.map((n) => n.midi)]),
);

for (const [name, pitches] of Object.entries(gt)) {
  const ps = pitches as number[];
  console.error(`${name.padEnd(9)} ${ps.length}음  음역 ${Math.min(...ps)}~${Math.max(...ps)}`);
}

// 정답 JSON 은 표준 출력으로만 낸다. 진단은 표준 오류로 보낸다.
console.log(JSON.stringify(gt));
