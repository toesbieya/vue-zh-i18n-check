<template>
  <i18n-t keypath="tip.已选几列共几列" tag="span">
    <template #count>{{ count }}</template>
  </i18n-t>
  <I18nT :keypath="'tip.共几页'" />
  <i18n-t :keypath="dynamicKey" />
</template>
