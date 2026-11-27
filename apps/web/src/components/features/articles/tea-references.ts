// SPDX-License-Identifier: MIT
// SPDX-FileCopyrightText: 2026 OpenTea Developers

/** Real articles and documents on other sites, checked to open on 2026-11-27. The app only links to them. */
export interface Reference {
  title: string
  source: string
  url: string
}

export const REFERENCES = {
  winterTea: { title: 'Áp dụng công nghệ sản xuất chè vụ đông', source: 'Báo Đại biểu Nhân dân', url: 'https://daibieunhandan.vn/ap-dung-cong-nghe-san-xuat-che-vu-dong-10353935.html' },
  sustainable: { title: 'Hướng dẫn sản xuất chè bền vững', source: 'Trung tâm Khuyến nông Quốc gia · PDF', url: 'https://khuyennongvn.gov.vn/data/documents/0/2024/04/12/hangweb/huong-dan-san-xuat-che-ben-vung-out.pdf' },
  vietgapValue: { title: 'Sản xuất chè VietGAP, tăng 30 - 40% giá trị', source: 'Báo Nông nghiệp và Môi trường', url: 'https://nongnghiepmoitruong.vn/san-xuat-che-vietgap-tang-30--40-gia-tri-d372924.html' },
  vietgapTanCuong: { title: 'Các yếu tố ảnh hưởng tới phát triển sản xuất chè VietGAP tại xã Tân Cương', source: 'Tạp chí Công Thương', url: 'https://tapchicongthuong.vn/cac-yeu-to-anh-huong-toi-phat-trien-san-xuat-che-theo-tieu-chuan-vietgap-tren-dia-ban-xa-tan-cuong--tinh-thai-nguyen-516462.htm' },
  dongHy: { title: 'Sản xuất theo chuẩn, tăng giá trị chè Đồng Hỷ', source: 'VnBusiness', url: 'https://vnbusiness.vn/san-xuat-theo-chuan-tang-gia-tri-che-dong-hy.html' },
  leafhopper: { title: 'Nghiên cứu phân bón và sâu hại (rầy xanh, bọ trĩ) trên chè', source: 'Tạp chí ĐH Thái Nguyên · PDF', url: 'https://jst.tnu.edu.vn/jst/article/download/580/pdf' },
  mosquitoBug: { title: 'Nghiên cứu phòng trừ bọ xít muỗi hại chè', source: 'Tạp chí Khoa học Nông nghiệp (VAAS) · PDF', url: 'https://tapchi.vaas.vn/sites/tapchi.vaas.vn/files/tapchi/2021-05/tapchi12-2012-30.pdf' },
  blister: { title: 'Hướng dẫn phòng trừ bệnh phồng lá chè (2024)', source: 'Cơ quan BVTV Thái Nguyên · PDF', url: 'https://storage-vnportal.vnpt.vn/gov-tnn/11492/ConvertFiles/documents/13418123/14872999/196.%2019.03.2024%20h%C6%B0%E1%BB%9Bng%20d%E1%BA%ABn%20%C4%91%E1%BA%A1o%20%C3%B4n,%20ph%E1%BB%93ng%20l%C3%A1.signed.signed.pdf' },
  blightPatch: { title: 'Quy trình quản lý bệnh dán cao hại chè', source: 'Cục Bảo vệ thực vật · PDF', url: 'https://ppd.gov.vn/FileUpload/Documents/P.%20Ke%20hoach/TBKT/20.03.26_%20PL%20QT%20Dan%20cao%20hai%20che.pdf' },
} satisfies Record<string, Reference>
