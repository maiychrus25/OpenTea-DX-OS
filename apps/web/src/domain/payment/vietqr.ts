// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

// VietQR / NAPAS (EMVCo) payload for a bank transfer. Port of miniapps/tea-tour/tea_tour/domain/vietqr.py (commit b60708fb).

export interface Bank {
  bin: string
  name: string
}

export const BANKS: readonly Bank[] = [
  ['Agribank', '970405'], ['Co-opBank', '970446'], ['BIDV', '970418'], ['VietinBank', '970415'],
  ['Vietcombank', '970436'], ['MB', '970422'], ['Techcombank', '970407'], ['ACB', '970416'],
  ['VPBank', '970432'], ['TPBank', '970423'], ['Sacombank', '970403'], ['HDBank', '970437'],
  ['VIB', '970441'], ['SHB', '970443'], ['LPBank', '970449'], ['Eximbank', '970431'], ['MSB', '970426'],
  ['OCB', '970448'], ['SeABank', '970440'], ['Nam A Bank', '970428'], ['Bac A Bank', '970409'],
].map(([name, bin]) => ({ bin, name }))

/** The transfer note field is short on most banking apps. */
export const CONTENT_MAX = 25

export function bankByBin(bin: string): Bank | null {
  return BANKS.find((b) => b.bin === bin) ?? null
}

const field = (tag: string, value: string) => `${tag}${String(value.length).padStart(2, '0')}${value}`

/** CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF) as 4 upper-case hex digits. */
export function crc16(text: string): string {
  let crc = 0xffff
  for (const char of text) {
    crc ^= char.charCodeAt(0) << 8
    for (let i = 0; i < 8; i += 1) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export function payload(bin: string, account: string, amountVnd: bigint, content: string): string {
  if (!/^[0-9]{6}$/.test(bin)) throw new Error('BIN phải đủ 6 chữ số')
  if (!/^[0-9]{6,19}$/.test(account)) throw new Error('Số tài khoản phải từ 6 đến 19 chữ số')
  if (amountVnd <= BigInt(0)) throw new Error('Số tiền phải lớn hơn 0')
  if (!/^[\x20-\x7E]+$/.test(content) || content.length > CONTENT_MAX) throw new Error(`Nội dung chuyển khoản phải là chữ ASCII, tối đa ${CONTENT_MAX} ký tự`)
  const beneficiary = field('00', bin) + field('01', account)
  const merchant = field('00', 'A000000727') + field('01', beneficiary) + field('02', 'QRIBFTTA')
  const body = field('00', '01') + field('01', '12') + field('38', merchant) + field('53', '704')
    + field('54', amountVnd.toString()) + field('58', 'VN') + field('62', field('08', content)) + '6304'
  return body + crc16(body)
}

const ascii = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').replace(/[^A-Za-z0-9]/g, '')

/** `QT {period date} {last four of the household id}`, ASCII only, at most 25 characters. */
export function transferNote(periodCode: string, householdId: string): string {
  const date = ascii(periodCode.split('-').pop() ?? '').toUpperCase()
  const tail = ascii(householdId).slice(-4).toUpperCase()
  return `QT ${date} ${tail}`.trim().slice(0, CONTENT_MAX)
}

/** Only the last four digits of a bank account are ever shown to a farmer or written to a response log. */
export function maskAccount(account: string): string {
  return `${'*'.repeat(Math.max(0, account.length - 4))}${account.slice(-4)}`
}
