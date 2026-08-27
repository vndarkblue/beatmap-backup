export const isDev =
  process.env.NODE_ENV === 'development' ||
  process.env.NODE_ENV === 'test' ||
  process.env.NODE_ENV !== 'production'

export const is = {
  dev: isDev
}
