<template>
  <div
    class="overflow-x-auto rounded-lg border border-line bg-surface shadow-card"
  >
    <table
      class="w-full min-w-[42rem] border-collapse bg-surface [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-surface-muted/60 [&_td]:border-b [&_td]:border-line [&_td]:px-4 [&_td]:py-3.5 [&_td]:text-left [&_td]:align-middle [&_td]:text-[0.85rem] [&_td]:leading-normal [&_td]:text-ink [&_th]:border-b [&_th]:border-line [&_th]:bg-surface-muted/75 [&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:align-middle [&_th]:text-[0.7rem] [&_th]:font-bold [&_th]:uppercase [&_th]:text-ink-muted [&_tr:last-child_td]:border-b-0"
    >
      <slot />
    </table>
  </div>
</template>
