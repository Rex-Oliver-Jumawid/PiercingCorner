import { cva } from "class-variance-authority";

export const eyebrow = "m-0 text-[8px] font-extrabold tracking-[1.4px] text-hippy-rust uppercase";

export const field = "flex flex-col gap-[7px] text-xs font-[750] text-[#554740] [&_input]:min-h-[45px] [&_input]:w-full [&_input]:rounded-[11px] [&_input]:border [&_input]:border-studio-line [&_input]:bg-white [&_input]:px-3 [&_input]:py-2.5 [&_input]:text-espresso [&_input]:outline-none [&_select]:min-h-[45px] [&_select]:w-full [&_select]:rounded-[11px] [&_select]:border [&_select]:border-studio-line [&_select]:bg-white [&_select]:px-3 [&_select]:py-2.5 [&_select]:text-espresso [&_select]:outline-none [&_textarea]:min-h-[84px] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-[11px] [&_textarea]:border [&_textarea]:border-studio-line [&_textarea]:bg-white [&_textarea]:px-3 [&_textarea]:py-2.5 [&_textarea]:text-espresso [&_textarea]:outline-none";

export const formError = "rounded-[10px] bg-[#f9e6df] px-[13px] py-[11px] text-xs leading-6 text-danger";

export const studioButton = cva(
  "inline-flex min-h-[43px] cursor-pointer items-center justify-center gap-2 rounded-full border border-transparent px-[19px] text-[13px] font-[750] transition-[transform,background,border] duration-150 hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-48 disabled:transform-none",
  {
    variants: {
      variant: {
        primary: "bg-espresso text-cream hover:bg-[#47332c]",
        secondary: "border-studio-line bg-paper",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);

export const hippyButton = cva(
  "inline-flex min-h-[43px] cursor-pointer items-center justify-center gap-2 rounded-[13px_10px_14px_11px] border-2 border-hippy-ink px-[19px] text-[13px] font-[750] shadow-[3px_3px_0_#3b2923] transition-[transform,background,box-shadow] duration-150 hover:translate-y-px hover:shadow-[2px_2px_0_#3b2923] disabled:cursor-not-allowed disabled:opacity-48 disabled:transform-none",
  {
    variants: {
      variant: {
        primary: "bg-hippy-orange text-white hover:bg-[#ca5725]",
        secondary: "bg-[#fffaf0] text-hippy-ink",
      },
    },
    defaultVariants: { variant: "primary" },
  },
);