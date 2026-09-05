import { cva } from "class-variance-authority";

export const eyebrow = "m-0 text-[8px] font-extrabold tracking-[1.4px] text-hippy-rust uppercase";

export const dashButton = cva(
  "inline-flex min-h-[38px] cursor-pointer items-center justify-center gap-2 rounded-[13px_10px_14px_11px] border-2 border-hippy-ink px-4 text-[11px] font-[750] shadow-[3px_3px_0_#3b2923] transition-[transform,background,box-shadow] duration-150 hover:translate-y-px hover:shadow-[2px_2px_0_#3b2923] disabled:cursor-not-allowed disabled:opacity-48 disabled:transform-none",
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

export const dashField = "flex flex-col gap-[7px] text-xs font-[750] text-[#694d43] [&_input]:min-h-[42px] [&_input]:w-full [&_input]:rounded-[10px_7px_11px_8px] [&_input]:border-[1.5px] [&_input]:border-hippy-ink [&_input]:bg-[#fffaf0] [&_input]:px-3 [&_input]:py-2 [&_input]:text-hippy-ink [&_input]:shadow-[2px_2px_0_#d9a47e] [&_input]:outline-none [&_input]:placeholder:text-studio-muted [&_input:focus]:border-hippy-orange [&_input:focus]:outline-[3px] [&_input:focus]:outline-[#df682c35] [&_select]:min-h-[42px] [&_select]:w-full [&_select]:rounded-[10px_7px_11px_8px] [&_select]:border-[1.5px] [&_select]:border-hippy-ink [&_select]:bg-[#fffaf0] [&_select]:px-3 [&_select]:py-2 [&_select]:text-hippy-ink [&_select]:shadow-[2px_2px_0_#d9a47e] [&_select]:outline-none [&_select:focus]:border-hippy-orange [&_select:focus]:outline-[3px] [&_select:focus]:outline-[#df682c35] [&_textarea]:min-h-[84px] [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:rounded-[10px_7px_11px_8px] [&_textarea]:border-[1.5px] [&_textarea]:border-hippy-ink [&_textarea]:bg-[#fffaf0] [&_textarea]:px-3 [&_textarea]:py-2 [&_textarea]:text-hippy-ink [&_textarea]:shadow-[2px_2px_0_#d9a47e] [&_textarea]:outline-none [&_textarea:focus]:border-hippy-orange [&_textarea:focus]:outline-[3px] [&_textarea:focus]:outline-[#df682c35]";
export const dashError = "rounded-lg border-[1.5px] border-hippy-rust bg-[#fbebe6] px-3 py-2 text-xs font-bold text-hippy-rust";

export const featureView = "flex flex-col gap-6";
export const pageIntro = "relative mb-[5px] flex min-h-[67px] items-start justify-between gap-5 after:absolute after:bottom-0 after:left-0 after:h-2 after:w-[52px] after:-rotate-2 after:rounded-[60%_40%_70%_30%] after:bg-hippy-orange after:content-[''] before:absolute before:bottom-[-3px] before:left-[61px] before:text-[15px] before:text-hippy-gold before:text-shadow-[1px_1px_0_#3b2923] before:content-['?'] max-[760px]:min-h-[75px] max-[760px]:flex-col [&_h1]:m-0 [&_h1]:font-display [&_h1]:text-[30px] [&_h1]:font-[760] [&_h1]:tracking-[-.8px] [&_h1]:text-hippy-ink max-[450px]:[&_h1]:text-[26px] [&_h2]:m-0 [&_h2]:font-display [&_h2]:text-[26px] [&_h2]:font-[760] [&_h2]:tracking-[-.8px] [&_h2]:text-hippy-ink [&_p]:mt-[5px] [&_p]:mb-0 [&_p]:text-xs [&_p]:text-[#755b52]";
export const metricGrid = "grid grid-cols-4 gap-[15px] max-[1100px]:grid-cols-2 max-[450px]:grid-cols-1";
export const metricGridThree = "grid w-full grid-cols-3 gap-[15px] max-[1100px]:grid-cols-2 max-[640px]:grid-cols-1 max-[1100px]:[&>*:last-child]:col-span-2 max-[640px]:[&>*:last-child]:col-auto";
export const metricCard = "relative flex min-h-[118px] items-center gap-[13px] overflow-hidden rounded-[19px_14px_20px_16px] border-[1.5px] border-hippy-ink bg-[#fff8e8] p-[17px] shadow-[4px_4px_0_#3b2923] after:absolute after:top-[-19px] after:right-[-19px] after:size-10 after:rounded-full after:border-[7px] after:border-dotted after:border-[#dc6733] after:opacity-50 after:content-[''] nth-[2]:rotate-[.35deg] nth-[2]:bg-[#f8d4bb] nth-[3]:-rotate-[.35deg] nth-[3]:bg-[#e8def0] nth-[4]:bg-[#d8e5cf] max-[760px]:min-h-[98px] max-[760px]:p-3 max-[760px]:shadow-[3px_3px_0_#3b2923] max-[450px]:min-h-[85px] [&>span]:grid [&>span]:size-[43px] [&>span]:shrink-0 [&>span]:place-items-center [&>span]:rounded-[50%_43%_54%_45%] [&>span]:border-[1.5px] [&>span]:border-hippy-ink [&>span]:bg-hippy-orange [&>span]:text-white [&>span]:shadow-[2px_2px_0_#3b2923] nth-[2]:[&>span]:bg-hippy-gold nth-[2]:[&>span]:text-[#59351c] nth-[3]:[&>span]:bg-[#795d8e] nth-[4]:[&>span]:bg-[#538679] max-[760px]:[&>span]:size-9 [&>span_svg]:w-[19px] [&>div]:flex [&>div]:min-w-0 [&>div]:flex-col [&_small]:text-[9px] [&_small]:text-[#765c52] [&_strong]:my-1 [&_strong]:font-display [&_strong]:text-[22px] [&_strong]:font-[650] [&_strong]:text-hippy-ink [&_strong]:whitespace-nowrap max-[760px]:[&_strong]:text-[17px] [&_p]:m-0 [&_p]:text-[8px] [&_p]:text-[#765c52]";
export const twoPanel = "grid grid-cols-[minmax(0,1.7fr)_minmax(280px,.8fr)] gap-[18px] max-[1100px]:grid-cols-1";
export const panel = "overflow-hidden rounded-[19px_14px_20px_16px] border-[1.5px] border-hippy-ink bg-[#fff9eb] shadow-[4px_4px_0_#3b2923] max-[450px]:rounded-[15px_11px_16px_12px]";
export const panelHead = "flex min-h-[66px] items-center justify-between border-b border-dashed border-[#c98965] bg-[#fff7e5] px-[18px] py-3.5 [&_h3]:m-0 [&_h3]:font-display [&_h3]:text-base [&_h3]:font-[760] [&_h3]:text-hippy-ink [&_h2]:m-0 [&_h2]:font-display [&_h2]:text-base [&_h2]:font-[760] [&_h2]:text-hippy-ink [&_p]:mt-1 [&_p]:mb-0 [&_p]:text-[9px] [&_p]:text-[#82675d]";
export const settingSection = `${panel} isolate pb-[17px]`;
export const settingsStack = "flex flex-col gap-[19px]";
export const settingsListRow = "flex min-h-[54px] w-full items-center gap-3 border-0 border-t border-dashed border-[#d6a786] bg-transparent px-[18px] py-2 text-left text-hippy-ink [&>span]:flex [&>span]:min-w-0 [&>span]:flex-1 [&>span]:flex-col [&>span]:gap-[3px] [&_strong]:text-xs [&_small]:text-[10px] [&_small]:text-studio-muted";
export const inlineForm = "mx-[18px] my-3.5 grid grid-cols-4 gap-[11px] rounded-[15px_11px_16px_12px] border-[1.5px] border-hippy-ink bg-[#f4d59b] p-[15px] shadow-[3px_3px_0_#3b2923] max-[1100px]:grid-cols-2 max-[760px]:grid-cols-1 [&>div]:col-span-full [&>div]:flex [&>div]:flex-wrap [&>div]:items-center [&>div]:justify-end [&>div]:gap-2 max-[760px]:[&>div]:col-auto [&>[role=alert]]:col-span-full max-[760px]:[&>[role=alert]]:col-auto";
export const statusNote = "text-xs text-studio-muted";

export const statusPill = cva("inline-flex min-h-[23px] items-center justify-self-start rounded-full border px-2 text-[10px] font-extrabold not-italic whitespace-nowrap capitalize", {
  variants: {
    status: {
      confirmed: "border-[#4a6d5b] bg-[#c8dfc6] text-[#315342]",
      pending: "border-[#9b631d] bg-[#f3ce70] text-[#694313]",
      requested: "border-[#9b631d] bg-[#f3ce70] text-[#694313]",
      skipped: "border-[#9b631d] bg-[#f3ce70] text-[#694313]",
      completed: "border-[#68547a] bg-[#ddd0e5] text-[#5a436c]",
      sent: "border-[#68547a] bg-[#ddd0e5] text-[#5a436c]",
      cancelled: "border-[#9a4734] bg-[#f0c0ad] text-[#783321]",
      rejected: "border-[#9a4734] bg-[#f0c0ad] text-[#783321]",
      failed: "border-[#9a4734] bg-[#f0c0ad] text-[#783321]",
      no_show: "border-[#9a4734] bg-[#f0c0ad] text-[#783321]",
    },
  },
});
export type StatusTone = "confirmed" | "pending" | "requested" | "skipped" | "completed" | "sent" | "cancelled" | "rejected" | "failed" | "no_show";
export function statusClasses(value: string) {
  return statusPill({ status: (value in statusTones ? value : "confirmed") as StatusTone });
}
const statusTones: Record<StatusTone, true> = { confirmed: true, pending: true, requested: true, skipped: true, completed: true, sent: true, cancelled: true, rejected: true, failed: true, no_show: true };

export const emptyState = "relative flex min-h-[250px] flex-col items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_46%,#efb83f1b_0_75px,transparent_77px)] p-[30px] text-center before:absolute before:top-[24%] before:left-[18%] before:-rotate-[13deg] before:text-[28px] before:text-hippy-lilac before:content-['?'] after:absolute after:right-[18%] after:bottom-[24%] after:text-xl after:text-hippy-orange after:content-['?'] [&>span]:z-1 [&>span]:mb-3 [&>span]:grid [&>span]:size-[45px] [&>span]:place-items-center [&>span]:rounded-full [&>span]:border-[1.5px] [&>span]:border-hippy-ink [&>span]:bg-hippy-sage [&>span]:p-[11px] [&>span]:text-[#315342] [&>span]:shadow-[3px_3px_0_#3b2923] [&>strong]:font-display [&>strong]:text-[15px] [&>strong]:font-[650] [&>p]:mx-0 [&>p]:my-1.5 [&>p]:max-w-[310px] [&>p]:text-[10px]/[1.55] [&>p]:text-studio-muted";

export const tablePanel = `${panel} overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&_table]:min-w-[680px] [&_table]:w-full [&_table]:border-collapse [&_table]:bg-[#fff9eb] [&_th]:h-[38px] [&_th]:bg-[#f5ddba] [&_th]:px-4 [&_th]:text-left [&_th]:text-[8px] [&_th]:tracking-[.6px] [&_th]:text-[#795346] [&_th]:uppercase [&_td]:min-h-[58px] [&_td]:border-t [&_td]:border-dashed [&_td]:border-[#dab08f] [&_td]:px-4 [&_td]:py-[13px] [&_td]:text-[10px] [&_td]:text-[#695249] [&_tbody_tr:hover]:bg-[#fff1cf]`;
export const clientTablePanel = `${tablePanel} [&_table]:min-w-[850px]`;
export const operationBackdrop = "fixed inset-0 z-100 grid place-items-center bg-[#2d1812a6] p-[18px] backdrop-blur-[4px]";
export const operationDialog = "max-h-[min(900px,94vh)] w-[min(720px,100%)] overflow-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden rounded-[22px] border-2 border-hippy-ink bg-[#fff5df] shadow-[8px_8px_0_#3b2923] outline-none max-[700px]:max-h-[96vh] max-[700px]:rounded-[18px] [&>header]:sticky [&>header]:top-0 [&>header]:z-4 [&>header]:flex [&>header]:justify-between [&>header]:gap-4 [&>header]:border-b [&>header]:border-dashed [&>header]:border-[#c88f6e] [&>header]:bg-[#fff5df] [&>header]:px-[21px] [&>header]:py-[19px] [&>header_h2]:m-0 [&>header_h2]:font-display [&>header_h2]:text-[23px] [&>header_h2]:font-bold [&>header_p]:mt-[5px] [&>header_p]:mb-0 [&>header_p]:text-xs [&>header_p]:text-[#785d53] [&>header_button]:grid [&>header_button]:size-[34px] [&>header_button]:shrink-0 [&>header_button]:cursor-pointer [&>header_button]:place-items-center [&>header_button]:rounded-[10px] [&>header_button]:border-[1.5px] [&>header_button]:border-hippy-ink [&>header_button]:bg-[#efc6a4] [&>header_button]:p-0 [&>header_button]:leading-none [&>header_button_svg]:block [&>header_button_svg]:size-4";
export const operationForm = "flex flex-col gap-[15px] p-[21px] max-[700px]:p-4 [&>footer]:mt-1 [&>footer]:flex [&>footer]:flex-wrap [&>footer]:justify-end [&>footer]:gap-[9px]";
export const operationGrid = "grid grid-cols-2 gap-3 max-[700px]:grid-cols-1";
export const stateCard = `${panel} ${emptyState} [&>svg]:z-1 [&>svg]:mb-3 [&>svg]:size-[45px] [&>svg]:rounded-full [&>svg]:border-[1.5px] [&>svg]:border-hippy-ink [&>svg]:bg-hippy-sage [&>svg]:p-[11px] [&>svg]:text-[#315342] [&>svg]:shadow-[3px_3px_0_#3b2923] [&_h2]:m-0 [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-[650]`;
export const pagination = "flex min-h-[56px] items-center justify-end gap-2 border-t border-dashed border-[#d6a786] px-4 py-2 text-[9px] [&_button]:min-h-[32px] [&_button]:text-[9px]";