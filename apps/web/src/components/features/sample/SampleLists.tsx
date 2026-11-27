// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

import React from 'react'
import { SampleTag } from './SampleTag'
import styles from './sample.module.css'

// The design's examples, shown only while there is nothing real to list.
function SampleList({ title, rows, bare }: { title: string; rows: [string, string, string?][]; bare?: boolean }) {
  return (
    // Inside a panel that already has a title and a border, only the tag is added.
    <section className={bare ? undefined : styles.card} aria-label={title}>
      {bare ? (
        <p style={{ margin: 0, padding: '8px 18px 0' }}><SampleTag /></p>
      ) : (
        <div className={styles.head}>
          <h2>{title}</h2>
          <SampleTag />
        </div>
      )}
      <ul className={styles.rows}>
        {rows.map(([name, detail, side]) => (
          <li key={name}>
            <span><strong>{name}</strong><small>{detail}</small></span>
            {side && <span>{side}</span>}
          </li>
        ))}
      </ul>
    </section>
  )
}

export const SampleNotices = ({ bare }: { bare?: boolean }) => (
  <SampleList title="Thông báo" bare={bare} rows={[
    ['4 nhật ký đã quá hạn duyệt', 'Nhật ký của Đặng Thị Hoa và 2 hộ khác chờ hơn 2 ngày.', '08:15'],
    ['Ma Văn Thắng xin gia nhập HTX', 'Nông hộ xóm Hồng Thái, đăng ký 1 thửa 0,6 ha.', '07:02'],
    ['AI phát hiện bọ xít muỗi ở thửa T-022', 'Độ tin cậy 87%, đang chờ cán bộ kỹ thuật xác nhận.', '06:40'],
    ['Lô LO-TC-2311-02 đã in 240 tem QR', 'Trần Thị Lan thực hiện.', 'Hôm qua'],
  ]} />
)

export const SamplePartners = ({ bare, category = 'all' }: { bare?: boolean; category?: string }) => (
  <SampleList title="Danh sách đối tác" bare={bare} rows={([
    ['Công ty Chè Tân Thái', 'Thu mua chè búp tươi · cách 4,2 km', 'Thu mua'],
    ['Xưởng chè La Bằng', 'Thu mua, chế biến · cách 7,8 km', 'Thu mua'],
    ['Đại lý vật tư Phúc Xuân', 'Phân bón, thuốc BVTV · cách 3,1 km', 'Vật tư'],
    ['Cửa hàng nông sản Hồng Thái', 'Vật tư, dụng cụ · cách 5,6 km', 'Vật tư'],
    ['Vận tải Minh Phát', 'Xe tải 2,5 tấn · cách 6,0 km', 'Vận chuyển'],
  ] as [string, string, string][]).filter(row => category === 'all' || row[2] === category)} />
)

const APPS: [string, string, string][] = [
  ['Sổ thu chi HTX', 'Tài chính · OpenTea', 'Ghi thu chi, công nợ thành viên, xuất báo cáo quý.'],
  ['Cửa hàng trực tuyến', 'Bán hàng · OpenTea', 'Bán chè theo lô, gắn sẵn QR truy xuất cho từng đơn.'],
  ['Cảm biến độ ẩm đất', 'Sản xuất · Cộng đồng', 'Kết nối cảm biến IoT, cảnh báo khi đất khô.'],
  ['Điều phối xe thu gom', 'Sản xuất · OpenTea', 'Xếp tuyến xe thu gom chè búp tươi theo lịch hái.'],
  ['Sổ tay sâu bệnh', 'Sản xuất · Cộng đồng', 'Thư viện ảnh và cách xử lý sâu bệnh hại chè.'],
  ['Biên bản họp điện tử', 'Quản trị · OpenTea', 'Soạn, biểu quyết và lưu biên bản đại hội thành viên.'],
]

export const SampleApps = () => (
  <section aria-label="Ứng dụng mẫu">
    <p><SampleTag /> Kho thật chưa có ứng dụng nào; dưới đây là ví dụ, chưa cài được.</p>
    <ul className={styles.grid} style={{ margin: 0, padding: 0, listStyle: 'none' }}>
      {APPS.map(([name, publisher, about]) => (
        <li key={name} className={`${styles.card} ${styles.app}`}>
          <strong>{name}</strong>
          <small>{publisher}</small>
          <p>{about}</p>
        </li>
      ))}
    </ul>
  </section>
)
