// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "**/*.tsbuildinfo",
      // 시안은 빌드 대상이 아닙니다. TASKS.md P0
      "ui/**",
      "desktop.html",
      "mobile.html",
      // 픽스처는 LilyPond·Python 산출물입니다.
      "packages/omr-vector/fixtures/**",
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
    },
    rules: {
      // 의도적으로 쓰지 않는 인자는 밑줄로 표시한다.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      // 타입 임포트를 값 임포트와 섞지 않는다. verbatimModuleSyntax 와 짝을 이룬다.
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      // 경고를 조용히 삼키지 않는다는 프로젝트 원칙의 최소 장치.
      "no-empty": ["error", { allowEmptyCatch: false }],
    },
  },

  // 이식된 벡터 파서. P0 의 지시는 "그대로 두고 빌드만 통하게 한다" 입니다.
  // 규칙을 끄지 않고 warn 으로 낮춥니다 — 보이되 P0 를 막지는 않게.
  // 현재 걸리는 것: noteParse.ts findMusicStartX 의 barlines 인자가 쓰이지 않습니다.
  // 이 파일들을 실제로 손보는 P1 에서 정리합니다.
  {
    files: ["packages/omr-vector/src/**/*.ts"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },

  // 설정 파일과 스크립트는 Node 전역을 씁니다.
  {
    files: ["*.config.{js,ts}", "**/*.config.{js,ts}", "scripts/**/*.ts"],
    rules: {
      "no-console": "off",
    },
  },

  prettier,
);
