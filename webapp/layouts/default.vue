<template>
  <div class="min-h-screen flex flex-col">
    <SiteHeader />
    <main class="flex-1"><slot /></main>
    <SiteFooter />
    <ClientOnly><ChatWidget /></ClientOnly>
  </div>
</template>
