# BÀI TOÁN NGHIỆP VỤ (BUSINESS ANALYSIS DOCUMENT)
## DỰ ÁN: DX-AGRIMARKET (HỆ ĐIỀU HÀNH SỐ NÔNG NGHIỆP)

> **Trạng thái:** Đang brainstorm — cập nhật liên tục theo phiên First Principles
> **Cập nhật lần cuối:** 2026-07-25 (Cán bộ KT/CL)
> **Đối tượng HTX:** HTX kiểu mới (hoạt động theo Luật HTX 2012/2023, vận hành như doanh nghiệp thực sự). Hệ thống cũng có thể là công cụ hỗ trợ HTX kiểu cũ chuyển đổi sang mô hình mới.

Mục tiêu tài liệu: Tài liệu này định nghĩa tầm nhìn, kiến trúc nghiệp vụ và yêu cầu hệ thống cho dự án DX-AgriMarket, bám sát bộ khung lý thuyết Hệ điều hành Doanh nghiệp Số (DX-OS) của VFOSSA dành cho cuộc thi OLP Tin học sinh viên (Phần mềm Nguồn mở).

---

### I. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)

#### 1.1. Bối cảnh & Vấn đề (Context & Problem)
- **Vấn đề cốt lõi:** Nông nghiệp Việt Nam liên tục đối mặt với điệp khúc "Được mùa mất giá, được giá mất mùa". Nguyên nhân gốc rễ là do Hợp tác xã (HTX) và Nông dân tổ chức sản xuất dựa trên **cảm tính và thông tin cục bộ**, thiếu tầm nhìn vĩ mô về chuỗi cung ứng toàn cầu và biến đổi khí hậu.
- **Điểm nghẽn công nghệ:** Các HTX thiếu một "Hệ điều hành" thực thụ để hội tụ dữ liệu (Single Source of Truth) từ các tổ chức quốc tế nhằm ra quyết định (Data-driven decision making).

#### 1.2. 8 Pain Point (Đã brainstorm & chốt)

HTX cần **3 thứ** để không bị thiệt khi bán nông sản: biết giá đúng, biết bán cho ai, và chứng minh được chất lượng. Nông dân cần được hỗ trợ thông tin và công cụ để canh tác hiệu quả.

| # | Pain Point | Actor chính | Mô tả | Giá trị |
|---|-----------|------------|-------|---------|
| 1 | **Giá bán như nào** | Trưởng HTX | HTX bị ép giá do bất đối xứng thông tin — thương lái biết giá thế giới, HTX thì không. | Phá thế độc quyền thông tin |
| 2 | **Bán ở đâu** | Trưởng HTX | HTX thiếu kênh kết nối người mua — chỉ biết vài thương lái quen, bị phụ thuộc. | Mở rộng lựa chọn bán hàng |
| 3 | **Chứng minh chất lượng** | Cán bộ KT/CL | DN thu mua hỏi nguồn gốc, quy trình canh tác → HTX không có gì để chứng minh → mất deal kênh cao cấp. | Mở cửa vào kênh cao cấp |
| 4 | **Quản lý nhiều hộ, nhiều thửa đất** | Cán bộ KT/CL | HTX có hàng chục hộ, hàng trăm thửa đất → ghi sổ tay/Excel rời rạc, lẫn lộn. | Số hóa quản lý vùng trồng |
| 5 | **Thông tin HTX bị trôi / đến chậm** | Nông dân | Thông báo từ HTX gửi trong nhóm chat bị trôi, nông dân bỏ lỡ thông tin quan trọng. | Thông tin đến đúng người |
| 6 | **Sâu bệnh không biết hỏi ai ngay** | Nông dân | Thấy cây bị bệnh, gọi Cán bộ KT không được, chờ 2-3 ngày sâu lan rồng. | Phát hiện sớm, giảm thiệt hại |
| 7 | **Thời tiết không cụ thể** | Nông dân | Đài báo chung chung "miền Tây có mưa", nông dân cần biết cụ thể thửa mình. | Ra quyết định đúng lúc |
| 8 | **Không biết giá nông sản** | Nông dân | Trưởng HTX biết giá vì có chatbot, nông dân thì không biết gì. | Minh bạch, tạo động lực |

> **Lưu ý:** Dự án KHÔNG hướng đến việc giúp HTX tự xuất khẩu (HTX VN không có năng lực này). Giá trị thực là giúp HTX **có thông tin để đàm phán tốt hơn** và **chứng minh được chất lượng** với thương lái và DN thu mua.

#### 1.3. Giải pháp (Solution)
Xây dựng **DX-AgriMarket** – một Hệ điều hành Nông nghiệp Số (Agri-OS) tuân thủ 100% chuẩn Nguồn Mở. Hệ thống tự động thu thập và phân tích dữ liệu thị trường, khí hậu toàn cầu (Public Domain), **trình bày sự thật có nguồn** bằng tiếng Việt cho Trưởng HTX — giúp cân bằng thông tin giữa HTX và thương lái.

> **Nguyên tắc AI:** AI trong hệ thống **KHÔNG ra quyết định, KHÔNG khuyến nghị hành động**. AI chỉ **tổng hợp sự thật từ nhiều nguồn** và trình bày rõ ràng bằng tiếng Việt kèm trích dẫn nguồn. Trưởng HTX tự quyết định dựa trên thông tin được cung cấp.

---

### II. MÔ HÌNH KIẾN TRÚC NGHIỆP VỤ DỰA TRÊN HPDI (DX-OS)

Dự án áp dụng triệt để mô hình **Human - Process - Data - Intelligence (HPDI)** từ tài liệu gốc của cuộc thi.

#### 2.1. Lớp [H] - Human Space (Không gian Tương tác)
Nơi con người giao tiếp với hệ thống.
- **Người dùng (Actors):** *(Chi tiết từng actor xem Mục III)*
  - **Trưởng HTX / Ban giám đốc:** ✅ Đã brainstorm chi tiết
  - **Cán bộ Kỹ thuật / Chất lượng:** ✅ Đã brainstorm chi tiết
  - **Nông dân (Thành viên HTX):** ✅ Đã brainstorm chi tiết
- **Công nghệ lõi:** Next.js (Web Portal responsive, tối ưu điện thoại) kết nối với Keycloak (cấu hình OTP qua SĐT — passwordless).

#### 2.2. Lớp [P] - Process Space (Không gian Quy trình)
Tự động hóa các luồng nghiệp vụ (Automation), loại bỏ sức người trong việc tổng hợp thông tin.
- **Nghiệp vụ cốt lõi:** Tự động hóa quá trình kéo API dữ liệu quốc tế, làm sạch dữ liệu, đẩy vào Data Warehouse, và tạo bản tin/notification.
- **Công nghệ lõi:** n8n (Được DX-OS khuyên dùng) đóng vai trò là "Nhạc trưởng" (Orchestrator) kết nối các dịch vụ.

#### 2.3. Lớp [D] - Data Space (Không gian Dữ liệu & Tài sản số)
Áp dụng kỷ luật "Chủ quyền Dữ liệu" theo chuẩn DX-OS.
- **Dữ liệu có cấu trúc (Database):** PostgreSQL lưu trữ các API thời gian thực.
  - Nguồn Cung-Cầu: USDA PSD & GATS (Bộ Nông nghiệp Hoa Kỳ - Public Domain).
  - Nguồn Sản lượng & Môi trường: FAOSTAT (CC BY 4.0).
  - Nguồn Khí hậu: NASA POWER (Public Domain).
- **Dữ liệu nội bộ HTX:** Profile HTX, dữ liệu đối tác/kho bãi trên bản đồ, danh sách hộ thành viên & thửa đất, nhật ký canh tác, tài liệu P.A.R.A (MinIO).

#### 2.4. Lớp [I] - Intelligence Space (Không gian Trí tuệ)
- **Vai trò AI:** Tổng hợp liên nguồn (cross-source synthesis) — đọc đồng thời 4-5 nguồn dữ liệu và kết nối chúng thành một bức tranh liên kết mà con người không tự ghép được khi nhìn từng nguồn riêng lẻ.
- **KHÔNG:** Ra quyết định, khuyến nghị hành động, nói "nên" hay "không nên".
- **Công nghệ lõi:** Ollama (chạy AI Local), TTS mã nguồn mở (Piper/Coqui) cho audio bản tin.

---

### III. CHI TIẾT NGƯỜI DÙNG (ACTORS)

#### 3.1. Trưởng HTX (Manager) — ✅ Đã brainstorm

##### Chân dung User
- **Tuổi:** 40–55, được Đại hội thành viên bầu ra
- **Học vấn:** Nông nghiệp, Quản trị kinh doanh, hoặc Kinh tế
- **Phẩm chất:** Am hiểu nông nghiệp, tinh thần tập thể, năng động dám nghĩ dám làm
- **Thiết bị:** Chủ yếu điện thoại, quen dùng các ứng dụng nhắn tin phổ biến, ít dùng máy tính
- **Hạn chế:** Không hiểu thuật ngữ quốc tế (USDA, EVFTA), không đọc tốt biểu đồ tiếng Anh
- **Vai trò thực tế:** Lãnh đạo & định hướng HTX, đàm phán giá bán, tìm kiếm thị trường, điều hành sản xuất, làm cầu nối giữa nông dân và doanh nghiệp

##### Công việc thực tế của Trưởng HTX (Đã nghiên cứu)
1. **Định kỳ:** Quản lý hành chính, điều hành sản xuất (lịch nông vụ), xây dựng thương hiệu (OCOP, VietGAP), tìm kiếm thị trường & đàm phán hợp đồng bao tiêu
2. **Sự vụ:** Giải quyết tranh chấp nội bộ, xử lý vi phạm quy trình, phối hợp khuyến nông, thủ tục pháp lý
3. **Sự cố:** Thiên tai/dịch bệnh, DN "bẻ kèo" hủy hợp đồng, thành viên "bán chui", hàng tồn kho ùn ứ
4. **Áp lực dài hạn:** Lo dòng tiền/vốn, lo đầu ra bị ép giá, giữ chân thành viên, cạnh tranh

> **Scope dự án:** Hệ thống tập trung giải quyết 2 pain point: "Giá bán như nào" và "Bán ở đâu". Các nhóm công việc khác (hành chính, nội bộ, tài chính...) nằm ngoài scope nhưng được acknowledge trong tài liệu để thể hiện chiều sâu phân tích.

##### Tính năng cho Trưởng HTX

**[Pain Point 1] Giá bán như nào:**

**Tính năng 1.1: Bản tin Nông nghiệp Số**
- **Mô tả:** AI tổng hợp liên nguồn (USDA, WTO, tỷ giá, thời tiết) → bản tin tóm tắt bằng tiếng Việt, cập nhật hàng ngày trên web.
- **Audio:** Người dùng bấm nút "Nghe nhanh" → hệ thống dùng TTS mã nguồn mở (Piper/Coqui) chạy local để convert bản tin thành audio tóm tắt.
- **Vai trò AI:** Trình bày SỰ THẬT có trích dẫn nguồn. KHÔNG ra quyết định, KHÔNG nói "nên" hay "không nên".
- **Filter:** Chỉ hiển thị thông tin liên quan đến cây trồng trong Profile HTX. Không thấy thông tin ngoài loại cây mà HTX đang trồng.
- **Kênh:** Hiển thị trên web (chính). Có thể gửi tóm tắt qua tin nhắn như một phương án tiếp cận nhanh.

**Tính năng 1.2: Notification thông minh**
- **Mô tả:** AI đánh giá các thông tin quan trọng, liên quan trực tiếp đến HTX (thời tiết, kinh tế, thị trường) và gửi notification qua nền tảng quen thuộc của user.
- **Trigger thị trường:** AI tự đánh giá mức độ quan trọng — biến động bất thường + ảnh hưởng tài chính trực tiếp đến HTX. KHÔNG dùng ngưỡng % cứng.
- **Trigger cross-actor:** Cán bộ KT/CL duyệt thu hoạch hoặc xuất QR lô hàng → hệ thống tự động gửi notification đến Trưởng HTX trên web (VD: *"Cán bộ Trần Văn B đã duyệt thu hoạch Thửa A3 lúc 14:00 ngày 20/07"*).
- **Phân phối:** Channel-agnostic — lõi MNM (n8n engine), connector tuỳ chọn (Mattermost làm demo, các nền tảng khác tuỳ triển khai thực tế).
- **Lưu ý:** Đây là notification, không phải cảnh báo khẩn cấp. User có đọc hay không là quyền của họ.

**Tính năng 1.3: Chatbot chuyên gia Thị trường**
- **Mô tả:** Giao diện chat trên web. Trưởng HTX hỏi bằng tiếng Việt, AI trả lời bằng dữ liệu liên nguồn có trích dẫn.
- **Scope:** CHỈ trả lời về giá cả, so sánh thị trường, đánh giá mức giá mua/bán.
- **KHÔNG trả lời:** Kỹ thuật nông nghiệp, pháp lý, hành chính, hay bất kỳ chủ đề nào ngoài giá cả & thị trường.
- **Lịch sử chat:** Lưu 7 ngày gần nhất. User mở lại thấy lại các cuộc hội thoại trước đó.
- **Ví dụ hỏi-đáp:**
  - User: *"Thương lái trả 12.000đ/kg gạo ST25, giá này hợp lý không?"*
  - AI: *"Sản lượng gạo Thái Lan giảm 15% do hạn hán (USDA, 23/07). Thuế xuất gạo vào EU: 0% (WTO/EVFTA). Giá FOB gạo Việt xuất khẩu: ~850 USD/tấn ≈ 20.400đ/kg. Giá 12.000đ/kg thấp hơn 41% so với giá xuất khẩu hiện tại."*
- **Công nghệ:** Next.js API route → query PostgreSQL → đưa context vào Ollama → trả lời.

**[Pain Point 2] Bán ở đâu:**

**Tính năng 2.1: Bản đồ Đối tác Nông nghiệp**
- **Mô tả:** Bản đồ tương tác trên web, hiển thị các DN thu mua, thương lái, kho bãi. Trưởng HTX mở bản đồ → thấy ngay ai mua gì quanh mình → tự liên hệ.
- **Công nghệ:** OpenStreetMap (bản đồ nền) + Leaflet.js / React-Leaflet (hiển thị) + Nominatim (search địa chỉ). 100% MNM, miễn phí.
- **Thêm đối tác:** Trưởng HTX tự thêm. Gõ địa chỉ → Nominatim gợi ý → chọn → ghim lên bản đồ. KHÔNG nhập toạ độ thủ công.
- **Sửa/Xoá đối tác:** Bấm vào marker → popup hiện info + nút [Sửa] [Xoá]. Sửa: cập nhật SĐT, tên, loại nông sản. Xoá: xác nhận trước khi xoá.
- **KHÔNG lọc:** Chỉ cung cấp công cụ, HTX tự liên hệ dựa trên thông tin hiển thị.
- **Data:** Tự nhập + seed data mẫu cho demo cuộc thi.

**Thông tin hiển thị trên bản đồ:**

| Loại đối tác | Thông tin hiển thị |
|-------------|-------------------|
| DN thu mua / Thương lái | Tên, loại, SĐT hoặc phương thức liên lạc khác, nông sản chủ yếu thu mua |
| Kho bãi | Tên, SĐT hoặc phương thức liên lạc khác, diện tích (m²) |

> **Lưu ý:** Thông tin "nông sản chủ yếu thu mua" là tổng quát, không phải realtime. Thương lái có thể thu cái này không thu cái kia tuỳ lúc — không thể thu thập data realtime được, nên không filter theo loại cây.

**[Bổ sung từ conflict resolution] Xem Vùng trồng:**

**Tính năng 2.2: Xem Bản đồ Vùng trồng HTX (Read-only)**
- **Mô tả:** Trưởng HTX có thể xem bản đồ vùng trồng của HTX đang quản lý — thấy toàn cảnh thửa đất, cây trồng, hộ thành viên, **trạng thái từng thửa**.
- **Trạng thái thửa hiển trên map:** Phân biệt bằng màu sắc: 🟢 Đang gieo | 🟡 Đang chăm sóc | 🟠 Đã nghiệm thu | 🔵 Đã thu hoạch
- **Filter:** Trưởng HTX có thể lọc theo **trạng thái** và/hoặc theo **loại cây trồng** (multi-choice — chọn nhiều loại cùng lúc).
- **Quyền:** CHỈ XEM (read-only). KHÔNG thêm/sửa/xoá thửa đất hay hộ thành viên (đó là việc của Cán bộ KT/CL).
- **UX:** Menu riêng "Vùng trồng HTX", giao diện giống bản đồ Cán bộ KT/CL nhưng không có các nút CRUD. KHÔNG trộn với bản đồ đối tác.

**Tính năng 2.3: Tạo Thông báo chung (Broadcast)**
- **Mô tả:** Trưởng HTX tạo thông báo chung → gửi broadcast đến Cán bộ KT/CL + tất cả Nông dân.
- **UX:** Form đơn giản: tiêu đề + nội dung + [Gửi]. Thông báo xuất hiện trên web bell của tất cả actors.
- **Ví dụ:** "Họp tổng kết vụ ngày 28/07 lúc 14h tại nhà văn hoá".

**Tính năng 2.4: Xem danh sách Lô hàng (Read-only)**
- **Mô tả:** Trưởng HTX xem danh sách tất cả lô hàng của HTX — trạng thái (Nháp / Sẵn sàng / Đã xuất QR), bấm vào xem nội dung QR.
- **Quyền:** CHỈ XEM (read-only). KHÔNG tạo/sửa/xoá lô (đó là việc của Cán bộ KT/CL).
- **UX:** Bảng danh sách, filter theo trạng thái. Khi nhận notification "Lô hàng mới đóng gói" → bấm → dẫn thẳng vào trang chi tiết lô.

##### Nền tảng chung cho Trưởng HTX

| Thành phần | Quyết định | Ghi chú |
|-----------|-----------|---------|
| **Profile HTX** | Tên, địa chỉ, cây trồng, diện tích, mùa vụ | Cho phép nhập tay tạm lúc đầu. Khi Cán bộ KT/CL khoanh thửa xong → **tự động tổng hợp từ Bản đồ Vùng trồng** (Turf.js). Bản tin default hiển tất cả khi chưa có data. Filter bản tin & notification theo cây trồng. KHÔNG filter bản đồ đối tác. |
| **Xác thực** | Keycloak + OTP qua SĐT | Cấu hình passwordless trong Keycloak. Quen thuộc như đăng nhập app ngân hàng. |
| **Giao diện** | Web responsive (Next.js) | Tối ưu điện thoại. UI riêng cho role Trưởng HTX. Chưa làm app mobile (giới hạn 2 tháng). |
| **Tin nhắn** | Channel-agnostic | Lõi MNM (n8n notification engine). Connector Mattermost (demo). Connector khác tuỳ triển khai thực tế. |

---

#### 3.2. Cán bộ Kỹ thuật / Chất lượng — ✅ Đã brainstorm

> **Thay thế:** Actor "Kỹ sư Nông nghiệp" từ BA gốc → đổi thành "Cán bộ KT/CL" vì đa số HTX không có kỹ sư chuyên trách, nhưng luôn có thành viên Ban quản trị phụ trách kỹ thuật.

##### Chân dung User
- **Tuổi:** 30–50, có chuyên môn nông nghiệp hoặc kinh nghiệm canh tác lâu năm
- **Vị trí trong HTX:** Thành viên Ban quản trị hoặc người được chỉ định chuyên trách kỹ thuật. Trong HTX nhỏ, Trưởng HTX hoặc Phó HTX kiêm luôn.
- **Vai trò:** Người duy nhất trong HTX **đi thực địa đều đặn** — kiểm tra đồng ruộng, ghi nhận tình trạng cây trồng, phối hợp kỹ thuật với nông dân, giám sát chất lượng
- **Thực tế hiện tại:** Ghi chép bằng sổ tay hoặc Excel rời rạc, ảnh chụp lưu trên điện thoại cá nhân, báo cáo miệng cho Trưởng HTX
- **Hạn chế:** Phải quản lý nhiều hộ (hàng chục đến hàng trăm), nhiều thửa đất — dễ nhầm, dễ sót, khó tổng hợp

##### Pain Point

| # | Pain Point | Mô tả thực tế |
|---|-----------|---------------|
| PP3 | **Chứng minh chất lượng** | DN thu mua hỏi: "Lô gạo này trồng ở đâu, phun thuốc ngày nào, thu hoạch lúc nào?" → HTX lục sổ tay không tìm được → mất deal kênh cao cấp |
| PP4 | **Quản lý nhiều hộ, nhiều thửa đất** | HTX có 50 hộ, 120 thửa đất, mỗi thửa trồng cây khác nhau, mùa vụ khác nhau → sổ tay lẫn lộn, mỗi người 1 file Excel, không ai tổng hợp được |

> PP3 và PP4 bổ trợ nhau: Không quản lý được hộ/thửa đất (PP4) → không ghi nhật ký đúng → không chứng minh được chất lượng (PP3).

##### Tính năng cho Cán bộ KT/CL

**[Pain Point 4] Quản lý nhiều hộ, nhiều thửa đất:**

**Tính năng 3.1: Bản đồ Vùng trồng HTX**
- **Mô tả:** Bản đồ tương tác hiển thị toàn bộ khu vực canh tác của HTX. Mỗi thửa đất được ghim trên bản đồ, hiển thị trực quan: đang trồng gì, thuộc hộ nào, diện tích bao nhiêu.
- **Biểu diễn trực quan:** Mỗi loại cây trồng có màu sắc hoặc icon riêng trên bản đồ → Cán bộ KT/CL nhìn vào thấy ngay toàn cảnh vùng trồng HTX mình quản lý.
- **Ảnh vệ tinh:** Có thể bật layer ảnh vệ tinh Copernicus Sentinel-2 (CC BY 4.0) làm nền bản đồ — hiển thị thực tế vùng trồng từ vệ tinh.
- **Khoanh vùng + Auto diện tích:** Cán bộ KT/CL vẽ polygon khoanh thửa đất trên bản đồ (Leaflet.draw) → Turf.js tự động tính diện tích → Profile HTX tổng hợp tự động từ tất cả thửa.
- **CRUD:** Thêm/sửa/xoá hộ thành viên, thêm thửa đất (search địa chỉ bằng Nominatim hoặc vẽ trên map), gán cây trồng và thành viên chịu trách nhiệm cho thửa đất.
- **Luồng CRUD tuần tự:** Thêm hộ (tên, SĐT) → chọn hộ → vẽ polygon thửa đất trên bản đồ → gán cây trồng. **Hộ → Thửa → Cây trồng**.
- **Công nghệ:** OpenStreetMap + Leaflet.js + Leaflet.draw + Turf.js + Copernicus WMS.
- **Data mỗi hộ:** Tên, SĐT, danh sách thửa đất.
- **Data mỗi thửa đất:** Vị trí (polygon trên bản đồ), diện tích (auto-calculate), cây trồng hiện tại, thành viên chịu trách nhiệm, mã định danh.
- **Trạng thái thửa (auto-derive từ nhật ký):**

| Điều kiện | Trạng thái | Màu |
|----------|-----------|:---:|
| Có entry "Gieo trồng", chưa có entry chăm sóc | 🟢 Đang gieo | Xanh lá |
| Có entry bón phân / tưới / phun thuốc | 🟡 Đang chăm sóc | Vàng |
| Cán bộ bấm [Duyệt thu hoạch] | 🟠 Đã nghiệm thu | Cam |
| Có entry "Thu hoạch" hoặc Lô đã tạo từ thửa này | 🔵 Đã thu hoạch | Xanh dương |

> Trạng thái tự động suy từ data nhật ký — KHÔNG cần nút chuyển tay. Reset khi vụ mới (entry "Gieo trồng" mới).

- **Phân quyền:** Cán bộ KT/CL = CRUD đầy đủ. Trưởng HTX = xem (read-only) + filter + notification khi có thay đổi.

**[Pain Point 3] Chứng minh chất lượng:**

**Tính năng 3.2: Nhật ký Canh tác Số**
- **Mô tả:** Ghi lại hoạt động canh tác theo từng thửa đất. KHÔNG theo chuẩn VietGAP — tự do ghi nhưng phải tuân thủ **bộ quy tắc tối thiểu** để đảm bảo chuyên nghiệp.
- **Ai ghi:**
  - **Cán bộ KT/CL tự ghi:** Nhập trực tiếp vào nhật ký (ghi hộ nông dân già hoặc ghi từ thực địa). Hệ thống validate đủ các trường bắt buộc → **auto approved** (vì Cán bộ chính là người duyệt).
  - **Nông dân trẻ ghi:** Gửi entry → trạng thái "Chờ duyệt" → Cán bộ KT/CL approve hoặc chỉnh sửa → auto-fill vào nhật ký chính thức.
  - **Nông dân già:** Báo cáo miệng/tin nhắn → Cán bộ KT/CL số hóa lên hệ thống.
- **Thời tiết tự động:** Mỗi entry tự động gắn dữ liệu thời tiết ngày đó từ Open-Meteo (không cần nhập tay).
- **Trường hợp không phun thuốc:** Nếu thửa đất không có entry "Phun thuốc" → hệ thống hiện "Không sử dụng thuốc BVTV" + tự động ĐẠT cách ly + QR ghi "Không sử dụng thuốc BVTV".

**Bộ quy tắc tối thiểu — Mỗi entry nhật ký BẮT BUỘC ghi:**

| Trường | Bắt buộc? | Mô tả | Ví dụ |
|--------|----------|-------|-------|
| Ngày thực hiện | ✅ | Ngày giờ hoạt động | 2026-07-20 08:00 |
| Thửa đất | ✅ | Chọn từ danh sách thửa đã đăng ký | Thửa A3 - Lô Đông |
| Loại hoạt động | ✅ | Chọn từ danh sách cố định | Gieo trồng / Bón phân / Phun thuốc / Tưới nước / Thu hoạch / Khác |
| Chi tiết hoạt động | ✅ | Mô tả cụ thể | "Bón phân NPK 20-20-15, liều 50kg/1000m²" |
| Người thực hiện | ✅ | Ai làm | Nguyễn Văn A |
| Tên sản phẩm sử dụng | ⚠️ Khi phun thuốc/bón phân | Tên thuốc/phân bón | Thuốc trừ sâu Regent 800WG |
| Liều lượng | ⚠️ Khi phun thuốc/bón phân | Số lượng + đơn vị | 50ml/bình 16L |
| Số ngày cách ly quy định | ⚠️ Khi phun thuốc | Đọc từ nhãn chai thuốc | 14 ngày |
| Ghi chú | ❌ Tuỳ chọn | Bổ sung thông tin | "Cây có dấu hiệu vàng lá" |
| Thời tiết | 🤖 Tự động | Hệ thống tự gắn từ Open-Meteo | Nắng, 32°C, độ ẩm 75% |

**Tính năng 3.3: QR Code Truy xuất Nguồn gốc**

**Nguyên tắc:** Khi sinh QR, user KHÔNG phải nhập thêm bất kỳ dữ liệu nào (trừ trọng lượng). Tất cả thông tin đã được capture sẵn từ workflow hàng ngày.

**Luồng tạo QR — 6 bước:**

```
Bước 1: Khởi tạo vùng trồng (SETUP — 1 lần)
  Ai: Trưởng HTX + Cán bộ KT/CL
  Làm gì: Vẽ bản đồ khu vực canh tác trên hệ thống,
          chia thành các thửa đất, cấp mã định danh
          cho mỗi hộ/thửa.
  Data capture: Thửa đất, cây trồng, hộ thành viên
          │
          ▼
Bước 2: Ghi nhật ký nông vụ (HÀNG NGÀY)
  Ai: Nông dân ghi (Cán bộ KT/CL giám sát & số hóa)
  Làm gì: Mỗi hoạt động (bón phân, phun thuốc, tưới)
          được ghi theo bộ quy tắc tối thiểu.
          Khi ghi "Phun thuốc" → bắt buộc ghi thêm
          "Số ngày cách ly quy định" (đọc từ nhãn chai).
  Data capture: Toàn bộ lịch sử canh tác + thời tiết auto
          │
          ▼
Bước 3: Nghiệm thu trước thu hoạch (KHI CẦN THU HOẠCH)
  Ai: Cán bộ KT/CL quyết định
  Hệ thống TỰ ĐỘNG hiển thị:
  ┌─────────────────────────────────────┐
  │ Thửa A3 - Lô Đông                  │
  │ Ngày phun thuốc cuối: 2026-07-06    │
  │ Thuốc: Regent 800WG                 │
  │ Cách ly quy định: 14 ngày           │
  │ Hôm nay: 2026-07-21                 │
  │ Đã cách ly: 15 ngày                 │
  │ Trạng thái: ✅ ĐẠT (15 ≥ 14)       │
  │                                     │
  │         [Duyệt thu hoạch]           │
  └─────────────────────────────────────┘
  Cán bộ KT/CL bấm [Duyệt thu hoạch] → hệ thống ghi:
  - Người duyệt: auto từ tài khoản đang login
  - Ngày duyệt: auto = hôm nay
  - Trạng thái thửa: "Đã nghiệm thu"
  Data capture: Người duyệt, ngày duyệt
          │
          ▼
Bước 4: Tập kết & Quy lô (SAU THU HOẠCH)
  Ai: Cán bộ KT/CL
  Làm gì: Tạo Lô mới trên hệ thống.
  - Chọn các thửa đã nghiệm thu ✅ (hệ thống CHỈ show
    thửa có trạng thái "Đã nghiệm thu")
  - Chọn hạng chất lượng: Loại 1 / Loại 2 (tuỳ chọn)
  - Trọng lượng: CHƯA NHẬP (chưa cân)
  → Lô được tạo ở trạng thái NHÁP
  Data capture: Danh sách thửa nguồn, hạng CL
  Hệ thống tự lấy: Mã lô (auto), ngày đóng gói (auto),
    nông sản (từ thửa đất), ngày thu hoạch (từ nhật ký)
          │
          ▼
Bước 5: Pre-review & Hoàn thiện (KHI CÓ TRỌNG LƯỢNG)
  Ai: Cán bộ KT/CL
  Hệ thống hiển thị PREVIEW toàn bộ nội dung QR:
  ┌─────────────────────────────────────┐
  │ ⬛ PREVIEW NỘI DUNG QR              │
  │                                     │
  │ Mã lô: MĐ2-ST25-20260720-001  [✓]  │
  │ Nông sản: Gạo ST25             [✓]  │
  │ Ngày thu hoạch: 2026-07-20     [✓]  │
  │ Ngày đóng gói: 2026-07-21      [✓]  │
  │ Phun thuốc cuối: 2026-07-06    [✓]  │
  │   Loại: Regent 800WG           [✓]  │
  │ Cách ly: 15 ngày (đạt ≥ 14)    [✓]  │
  │ HTX: HTX Mỹ Đông 2             [✓]  │
  │   SĐT: 0292.xxx.xxx            [✓]  │
  │ Người duyệt: Trần Văn B        [✓]  │
  │                                     │
  │ ⚠️ Trọng lượng: [______] kg         │
  │    ↑ BẮT BUỘC NHẬP                  │
  │                                     │
  │ [Cho phép chỉnh sửa các field]      │
  │                                     │
  │ [Lưu nháp]  [Xuất QR]              │
  │              ↑ chỉ bật khi đủ data   │
  └─────────────────────────────────────┘
  - Tất cả field đã auto-fill từ hệ thống
  - User có thể CHỈNH SỬA bất kỳ field nào nếu cần
  - Trọng lượng BẮT BUỘC nhập → nếu trống → nút
    [Xuất QR] bị disable, hiện thông báo
  - Bấm [Lưu nháp] → lưu lại, quay lại sau điền tiếp
  - Bấm [Xuất QR] → chuyển sang Bước 6
          │
          ▼
Bước 6: Sinh mã QR & Dán tem
  Ai: Hệ thống tự động
  Làm gì: Hệ thống sinh mã QR duy nhất chứa link đến
          trang public truy xuất nguồn gốc.
          Lô chuyển trạng thái: NHÁP → ĐÃ XUẤT QR
          In tem QR dán lên thùng/túi sản phẩm.
```

**Trạng thái Lô hàng:**

| Trạng thái | Mô tả | Chuyển tiếp |
|-----------|-------|------------|
| **Nháp** | Lô vừa tạo, data auto-fill, trọng lượng chưa có | → Sẵn sàng (khi nhập đủ) |
| **Sẵn sàng** | Đủ data, đã review, trọng lượng đã nhập | → Đã xuất QR |
| **Đã xuất QR** | QR đã sinh, không chỉnh sửa được nữa | Trạng thái cuối |

**Nội dung khi quét QR (trang public):**

| # | Thông tin | Nguồn data |
|---|----------|------------|
| 1 | Mã lô hàng | Auto-generate (Bước 4) |
| 2 | Nông sản gì | Data thửa đất → cây trồng (Bước 1) |
| 3 | Trọng lượng (kg) | User nhập (Bước 5) |
| 4 | Ngày thu hoạch | Nhật ký entry "Thu hoạch" (Bước 2) |
| 5 | Ngày đóng gói | Auto = ngày tạo Lô (Bước 4) |
| 6 | Phun thuốc lần cuối (ngày + loại thuốc) | Nhật ký entry cuối loại "Phun thuốc" (Bước 2) |
| 7 | Số ngày cách ly + trạng thái đạt/chưa đạt | Hệ thống tự tính từ Bước 2+3 |
| 8 | Tên & Liên hệ HTX | Profile HTX (Setup) |
| 9 | Người duyệt (Cán bộ KT) | Auto từ Bước 3 — tài khoản đang login |

**Cách chọn/quy lô hàng:**
- **Tiêu chí chính:** Theo **ngày thu hoạch** — tất cả nông sản thu hoạch cùng ngày (hoặc cùng đợt) từ các thửa đạt nghiệm thu được gộp thành 1 lô.
- **Tiêu chí phụ (tuỳ chọn):** Theo loại cây trồng, theo hạng chất lượng (loại 1/2), theo khu vực vùng trồng.
- **Mã lô:** Tự động sinh theo format: `[Mã HTX]-[Cây trồng]-[Ngày thu hoạch]-[Số thứ tự]`. VD: `MĐ2-ST25-20260720-001`

**Tính năng 3.4: P.A.R.A Quản lý Tài liệu**
- **Mô tả:** Upload/lưu trữ tài liệu HTX theo cấu trúc P.A.R.A (Projects - Areas - Resources - Archives).
- **Công nghệ:** MinIO (MNM, self-hosted) + giao diện folder trên Next.js.
- **Mục đích:**
  - Lưu tài liệu chuyên nghiệp (hợp đồng, báo cáo mùa vụ, chứng nhận nếu có)
  - Tài liệu làm nguồn RAG cho **Chatbot Cán bộ KT/CL** (chatbot riêng, không phải chatbot thị trường của Trưởng HTX)
- **Cấu trúc mẫu:**
  - **Projects:** Tài liệu theo mùa vụ đang chạy (VD: Vụ Hè Thu 2026)
  - **Areas:** Tài liệu vận hành liên tục (VD: Quy trình canh tác, Nội quy HTX)
  - **Resources:** Tài liệu tham khảo (VD: Hướng dẫn kỹ thuật, Bảng giá phân bón)
  - **Archives:** Lưu trữ dài hạn (VD: Báo cáo các mùa vụ đã xong)

**Tính năng 3.5: Chatbot Kỹ thuật (Cán bộ KT/CL)**
- **Mô tả:** Giao diện chat riêng cho Cán bộ KT/CL. AI trả lời dựa trên tài liệu HTX trong P.A.R.A.
- **Scope:** Kỹ thuật canh tác, tài liệu HTX, quy trình nông vụ.
- **KHÔNG trả lời:** Giá cả thị trường (đó là chatbot của Trưởng HTX).
- **Lịch sử chat:** Lưu 7 ngày gần nhất.
- **RAG source:** Tài liệu P.A.R.A trong MinIO.
- **Công nghệ:** Cùng Ollama, khác system prompt + RAG source so với chatbot Trưởng HTX.

**Tính năng 3.6: Gửi Thông báo Kỹ thuật**
- **Mô tả:** Cán bộ KT/CL tạo thông báo kỹ thuật → đẩy đến Nông dân (và tuỳ chọn gửi đến Trưởng HTX).
- **UX:** Form: tiêu đề + nội dung + chọn người nhận (tất cả nông dân / chọn hộ cụ thể) + checkbox [Gửi cho Trưởng HTX] + [Gửi].
- **Ví dụ:** "Lịch phun thuốc đồng loạt ngày 25/07 — tất cả thửa lúa ST25 khu Đông".

---

#### 3.3. Nông dân (Thành viên HTX) — ✅ Đã brainstorm

##### Chân dung User (2 persona)

**Persona 1 — Nông dân già (trên 40):**
- **Tuổi:** 40–60, canh tác nhiều năm, dựa vào kinh nghiệm
- **Thiết bị:** Smartphone rẻ, chủ yếu gọi điện và nhắn tin
- **Khả năng công nghệ:** Rất hạn chế — không gõ được form phức tạp
- **Kỳ vọng:** Chữ to, ít nút, có thể **nghe** thay vì đọc
- **Ghi nhật ký:** Báo cáo miệng/tin nhắn → Cán bộ KT/CL số hóa giúp

**Persona 2 — Nông dân trẻ (dưới 35):**
- **Tuổi:** 20–35, tiếp quản đất từ gia đình hoặc làm thuê cho HTX
- **Thiết bị:** Smartphone tốt, thành thạo
- **Khả năng công nghệ:** Thoải mái — muốn tự làm trên điện thoại
- **Kỳ vọng:** App nhanh, đẹp, tự phục vụ
- **Ghi nhật ký:** Tự ghi trên web (dùng cùng hệ thống nhật ký Cán bộ KT/CL)

##### Pain Point

| # | Pain Point | Mô tả thực tế |
|---|-----------|---------------|
| PP5 | **Thông tin HTX bị trôi / đến chậm** | Thông báo HTX gửi trong nhóm chat 50 người, tin quan trọng bị trôi, nông dân bỏ lỡ lịch phún thuốc, lịch họp |
| PP6 | **Sâu bệnh không biết hỏi ai ngay** | Thấy cây bị bệnh ngoài đồng, gọi Cán bộ KT không được (bận ở thửa khác), chờ 2-3 ngày sâu lan rộng |
| PP7 | **Thời tiết không cụ thể** | Đài báo chung "miền Tây có mưa rào" — nông dân cần biết cụ thể thửa mình mai có mưa không để kịp phơi lúa / gặt sớm |
| PP8 | **Không biết giá nông sản** | Trưởng HTX có chatbot biết giá, nông dân thì không biết gì, cảm giác bị động |

##### Tính năng cho Nông dân

**[Pain Point 5+7+8] Mỗi ngày ra đồng không biết gì:**

**Tính năng 4.1: Dashboard "Hôm nay"**
- **Mô tả:** Màn hình chính khi nông dân mở web — tổng hợp tất cả thông tin cần thiết trong 1 trang.
- **Nhiều role dùng:** Trưởng HTX và Cán bộ KT/CL cũng có Dashboard "Hôm nay" với nội dung tương tự nhưng tuỳ role (VD: Trưởng HTX thấy thửa toàn HTX, Nông dân chỉ thấy thửa mình).
- **Nội dung:**
  - 🌤️ **Thời tiết** cụ thể cho thửa đất của nông dân (Open-Meteo theo toạ độ thửa — đã có)
  - 🌾 **Giá nông sản** đơn giản: chỉ hiển thị giá nông sản **đang trồng**, 1 con số + xu hướng. **Tạm dùng mock data giá nội địa** (vì giá xuất khẩu không có ích cho nông dân).
  - 📋 **Thửa đất của tôi:** trạng thái hiện tại, đang giai đoạn nào (từ nhật ký + data thửa)
  - 🔔 **Thông báo mới** từ HTX (inbox riêng, không bị trôi)
  - 📸 **Nút "Chẩn đoán bệnh"** — link nhanh tới tính năng 4.3
  - 🐛 **Nhật ký bệnh** — link tới danh sách nhật ký bệnh của hộ mình (read-only, xem tính năng 4.3)
- **Accessibility:** Nút **"Nghe tóm tắt"** — TTS đọc toàn bộ dashboard cho nông dân già (Piper/Coqui — đã có)
- **Data:** 100% từ hệ thống đã có, chỉ cần 1 trang UI tổng hợp.

**[Pain Point 5] Thông tin HTX bị trôi:**

**Tính năng 4.2: Thông báo (n8n + Web Bell)**
- **Mô tả:** Tất cả 3 actor đều nhận thông báo qua **2 kênh**: n8n (push qua connector) và Web Bell (icon chuông trên web). Nội dung khác nhau tuỳ role.

**Ma trận thông báo:**

| Nội dung | Trưởng HTX | Cán bộ KT/CL | Nông dân |
|----------|:----------:|:------------:|:--------:|
| Bản tin thị trường (giá, công-cầu) | ✅ n8n + bell | ✅ n8n + bell | ✅ n8n + bell |
| Thông tin chung (lịch họp, thông báo HTX) | ✅ n8n + bell | ✅ n8n + bell | ✅ n8n + bell |
| Lô hàng đóng gói / thửa được duyệt thu hoạch | ✅ n8n + bell | — (người gửi) | ❌ |
| Chẩn đoán bệnh từ nông dân | ✅ bell | ✅ n8n + bell | — (người gửi) |
| Phản hồi chẩn đoán từ Cán bộ KT | ❌ | — (người gửi) | ✅ bell |
| Cảnh báo thời tiết bất thường | ✅ bell | ✅ bell | ✅ n8n + bell |
| Nhật ký nông dân gửi chờ duyệt | ❌ | ✅ bell | — (người gửi) |
| Kết quả duyệt nhật ký | ❌ | — (người gửi) | ✅ bell |

- **Web Bell:** Icon chuông trên header của tất cả actors, click vào thấy danh sách thông báo mới nhất.
- **n8n:** Push qua connector (Mattermost demo, các nền tảng khác tuỳ triển khai).
- **Accessibility:** Nút **"Nghe"** bên cạnh mỗi thông báo (TTS).
- **Quyền gửi thông báo:**
  - Trưởng HTX → gửi xuống Cán bộ + Nông dân (Tính năng 2.3 Broadcast)
  - Cán bộ KT/CL → gửi xuống Nông dân (thông báo kỹ thuật, lịch phun thuốc)
  - Nông dân → gửi lên Cán bộ KT/CL **thông qua chức năng** (chẩn đoán bệnh, gửi nhật ký chờ duyệt)

**[Pain Point 6] Sâu bệnh không biết hỏi ai:**

**Tính năng 4.3: Chẩn đoán bệnh cây qua ảnh (AI)**
- **Mô tả:** Nông dân chụp ảnh lá/cây bị bệnh → upload lên hệ thống → model AI dự đoán tên bệnh + độ tin cậy.
- **Model:** TensorFlow/Keras (Apache 2.0), tự train — 100% MNM hợp lệ.
- **Deploy:** Python FastAPI wrap model, expose REST API. Next.js frontend gọi API.
- **Luồng:**
  1. Nông dân bấm "Chẩn đoán bệnh" → chụp ảnh hoặc chọn từ thư viện
  2. Chọn thửa đất liên quan (dropdown thửa của mình)
  3. Upload → model predict → hiển thị: tên bệnh + % tin cậy
  4. **Nếu confidence < 60%:** Hiện cảnh báo *"Ảnh có thể chưa rõ, thử chụp lại"* + vẫn cho phép gửi nếu muốn.
  5. Luôn hiển dòng: *"Đây là kết quả dự đoán từ AI, cần Cán bộ KT xác nhận trước khi xử lý"*
  6. Bấm [Gửi cho Cán bộ KT] → notification tự động:
     - Cán bộ KT/CL nhận: *"Nông dân A phát hiện nghi ngờ bệnh Đạo ôn tại Thửa A3 [Xem ảnh]"*
     - Trưởng HTX cũng nhận notification (cross-actor)
  7. Cán bộ KT/CL xem → xác nhận hoặc sửa chẩn đoán → ghi vào **Nhật ký bệnh** của thửa đất
- **Khớp nguyên tắc AI:** Model trình bày KẼT QUẢ + độ tin cậy. Luôn ghi rõ "đây là AI dự đoán". KHÔNG nói "nên làm gì". Cán bộ KT/CL là người quyết định xử lý.

**Nhật ký bệnh (phần riêng):**
- Lưu trữ riêng với nhật ký canh tác thông thường.
- Mỗi entry gồm: ngày phát hiện, thửa đất, ảnh gốc, kết quả AI (tên bệnh + %), người phát hiện (nông dân), người xác nhận (Cán bộ KT), ghi chú xử lý.
- **Quyền xem:**
  - Cán bộ KT/CL: thấy **tất cả** nhật ký bệnh + lọc theo hộ/thửa đất
  - Nông dân: chỉ thấy nhật ký bệnh của **hộ mình** (read-only)

**[Bổ sung] Ghi nhật ký (Nông dân trẻ):**

**Tính năng 4.4: Ghi Nhật ký Canh tác (Nông dân trẻ)**
- **Mô tả:** Nông dân trẻ tự ghi nhật ký trên web, gửi cho Cán bộ KT/CL duyệt.
- **Luồng:**
  1. Nông dân chọn thửa đất (chỉ thấy thửa của mình) → ghi hoạt động theo bộ quy tắc tối thiểu
  2. Bấm [Gửi] → entry chuyển trạng thái **"Chờ duyệt"** + kèm ID nông dân
  3. **Khi đang "Chờ duyệt":** Nông dân có thể bấm **[Thu hồi]** để sửa rồi gửi lại.
  4. Cán bộ KT/CL nhận notification (web bell) → review entry
  5. Cán bộ KT/CL **approve hoặc chỉnh sửa** → entry được **auto-fill vào nhật ký chính thức** của thửa đất đó
  6. Nông dân nhận notification kết quả duyệt
- **Quyền:** Nông dân xem nhật ký thửa đất của mình = **read-only** (sau khi "Đã duyệt")
- **Nông dân già:** Không dùng tính năng này — báo cáo miệng/tin nhắn, Cán bộ KT/CL nhập giúp.

##### Nền tảng chung cho Nông dân

| Thành phần | Quyết định | Ghi chú |
|-----------|-----------|---------|
| **Xác thực** | Keycloak + OTP qua SĐT | Cùng hệ thống Keycloak, role "Farmer". Ghi chú "Mã OTP có hiệu lực trong 5 phút" trên màn hình nhập OTP. |
| **Giao diện** | Web responsive (Next.js) | UI riêng cho role Nông dân. Chữ to, ít nút. PWA là hướng mở rộng. |
| **Accessibility** | TTS trên mọi element | Nút "Nghe" ở dashboard, thông báo, kết quả chẩn đoán |

---

### IV. MA TRẬN PHÁP LÝ NGUỒN MỞ (LICENSE COMPLIANCE MATRIX)

> Đây là "Vũ khí bí mật" để đạt điểm tối đa từ Ban giám khảo, chứng minh đội thi am hiểu sâu sắc về Luật Bản quyền (Copyright) và Giấy phép Nguồn mở (Open Source Licensing).

| Lớp kiến trúc | Thành phần | Giấy phép | Đánh giá tuân thủ OLP |
| :--- | :--- | :--- | :--- |
| H (Presentation) | Next.js, React | MIT | Đạt |
| H (Security) | Keycloak | Apache License 2.0 | Đạt |
| H (Map) | OpenStreetMap, Leaflet.js, Nominatim | ODbL, BSD-2 | Đạt |
| P (Process) | n8n | Faircode | Đạt theo chuẩn DX-OS |
| D (Data Storage) | PostgreSQL | PostgreSQL License | Đạt |
| D (Market Data) | USDA PSD API, GATS API | Public Domain | Đạt (Miễn trừ bản quyền) |
| D (Climate Data) | NASA POWER API | Public Domain | Đạt (Miễn trừ bản quyền) |
| D (Agricultural Data) | FAOSTAT API | CC BY 4.0 | Đạt |
| I (AI Engine) | Ollama | MIT | Đạt |
| I (TTS Audio) | Piper TTS / Coqui TTS | MIT / MPL 2.0 | Đạt |
| I (Notification) | n8n + Mattermost connector | Faircode + MIT | Đạt |
| D (File Storage) | MinIO | AGPL v3 | Đạt |
| D (Satellite) | Copernicus Sentinel-2 WMS | CC BY 4.0 | Đạt |
| H (QR Code) | qrcode.js / node-qrcode | MIT | Đạt |
| H (Map Draw) | Leaflet.draw + Turf.js | MIT | Đạt |
| I (Disease Model) | TensorFlow / Keras | Apache 2.0 | Đạt |
| I (Model API) | FastAPI (Python) | MIT | Đạt |

#### Các API Bổ sung:
- **Thuế quan:** WTO Tariff Download Facility API, World Bank WITS API (Open Data CC BY 4.0).
- **Tỷ giá:** ExchangeRate-API / Frankfurter (MNM).
- **Thời tiết vi mô:** Open-Meteo (MNM, không cần API Key).
- **Tin tức:** GNews / Mediastack (tài liệu nền RAG cho AI).

---

### V. CHIẾN LƯỢC TRIỂN KHAI & TÍNH KHẢ THI (ROADMAP)

**Thời gian:** 2 tháng
**Chiến lược:** "Tích hợp thay vì xây mới" (Integration over coding)

#### GIAI ĐOẠN 1: THIẾT LẬP NỀN TẢNG (FOUNDATION)
**Mục tiêu:** Dựng xong khung sườn hệ thống, user có thể đăng nhập, Profile HTX hoạt động, dữ liệu bắt đầu tự động chảy về.

1. **Luồng Xác thực & Profile HTX - [Lớp H]**
   - Tích hợp Next-Auth với Keycloak OIDC (cấu hình OTP qua SĐT).
   - Trang Profile HTX: nhập tên, địa chỉ, cây trồng, diện tích, mùa vụ.
   - Web responsive, tối ưu cho điện thoại.

2. **Luồng Thu thập Dữ liệu - [Lớp P & D]**
   - n8n Workflow: kéo API USDA, WTO, ExchangeRate, Open-Meteo → lưu PostgreSQL.
   - Không có giao diện người dùng (chỉ cấu hình trong n8n).

#### GIAI ĐOẠN 2: TÍNH NĂNG CỐT LÕI (CORE VALUE - DEMO OLP)
**Mục tiêu:** Đưa dữ liệu ra màn hình, AI tổng hợp bản tin, chatbot hoạt động, bản đồ đối tác lên sóng. Đây là phần mang lên sân khấu thuyết trình.

3. **Bản tin Nông nghiệp Số + Audio - [Lớp H & I]**
   - AI tổng hợp liên nguồn → bản tin tiếng Việt hàng ngày.
   - Nút "Nghe nhanh" → TTS tạo audio tóm tắt.
   - Filter theo cây trồng từ Profile HTX.

4. **Chatbot chuyên gia Thị trường - [Lớp H & I]**
   - Giao diện chat trên web, lưu 7 ngày.
   - Scope: giá cả & thị trường only.
   - Next.js API → PostgreSQL → Ollama → response.

5. **Bản đồ Đối tác Nông nghiệp - [Lớp H & D]**
   - OpenStreetMap + Leaflet.js + Nominatim.
   - CRUD đối tác: thêm/sửa/xoá, search địa chỉ.
   - Seed data mẫu cho demo.

5b. **Tạo Thông báo Broadcast + Xem Lô hàng - [Lớp H]**
    - Trưởng HTX gửi thông báo chung (broadcast).
    - Trưởng HTX xem danh sách lô hàng (read-only).

#### GIAI ĐOẠN 2B: TÍNH NĂNG CÁN BỘ KT/CL (CORE VALUE)
**Mục tiêu:** Quản lý vùng trồng và truy xuất nguồn gốc hoạt động.

6. **Bản đồ Vùng trồng + Quản lý Hộ/Thửa đất - [Lớp H & D]**
   - Leaflet.js hiển thị thửa đất trực quan theo loại cây trồng.
   - Trạng thái thửa auto-derive từ nhật ký.
   - CRUD hộ thành viên + thửa đất (Hộ → Thửa → Cây).

7. **Nhật ký Canh tác Số - [Lớp H & D]**
   - Ghi hoạt động theo bộ quy tắc tối thiểu.
   - Cán bộ auto approved, nông dân chờ duyệt.
   - Thời tiết tự động gắn từ Open-Meteo.

8. **QR Code Truy xuất Nguồn gốc - [Lớp H & D]**
   - Luồng 6 bước: khởi tạo → ghi nhật ký → nghiệm thu → quy lô → pre-review → sinh QR.
   - Trang public quét QR xem nguồn gốc.

9. **P.A.R.A Quản lý Tài liệu - [Lớp D]**
   - MinIO + giao diện folder Next.js.
   - Tài liệu làm RAG cho AI chatbot.

9b. **Chatbot Kỹ thuật + Gửi Thông báo KT - [Lớp H & I]**
    - Chatbot riêng cho Cán bộ KT/CL (scope kỹ thuật).
    - Form gửi thông báo kỹ thuật xuống Nông dân.

#### GIAI ĐOẠN 2C: TÍNH NĂNG NÔNG DÂN (CORE VALUE)
**Mục tiêu:** Nông dân có công cụ riêng, giảm phụ thuộc vào thông tin miệng.

10. **Dashboard "Hôm nay" - [Lớp H]**
    - Tổng hợp thời tiết + giá + thửa đất + thông báo trên 1 trang.
    - Nút "Nghe tóm tắt" (TTS).

11. **Thông báo riêng (Inbox) - [Lớp H & P]**
    - Inbox cá nhân, không bị trôi.
    - n8n đẩy notification từ Trưởng HTX + Cán bộ KT.

12. **Chẩn đoán bệnh cây qua ảnh - [Lớp I]**
    - TF/Keras model (tự train) + FastAPI.
    - Kết quả gửi notification cho Cán bộ KT xác nhận.

13. **Ghi Nhật ký (Nông dân trẻ) - [Lớp H & D]**
    - Dùng chung backend nhật ký, UI đơn giản, chỉ thấy thửa mình.

#### GIAI ĐOẠN 3: MỞ RỘNG (EXTENSIONS)
**Mục tiêu:** Làm cho hệ thống hoàn thiện hơn. Chỉ làm nếu còn dư thời gian.

14. **Notification thông minh - [Lớp P & I]**
    - AI đánh giá mức quan trọng → gửi notification qua channel-agnostic.
    - n8n notification engine + connector.

---

### VI. KỊCH BẢN DEMO THỰC TẾ (Đã reframe)

> **Nguyên tắc demo:** AI trình bày sự thật có nguồn. KHÔNG bao giờ demo AI nói "nên" hay "không nên".

**Kịch bản 1 — Pain Point 1: "Giá bán như nào"**
- Trưởng HTX mở web trên điện thoại → thấy bản tin hôm nay tóm tắt tình hình thị trường gạo ST25.
- Bấm "Nghe nhanh" → nghe audio tóm tắt 30 giây.
- Muốn hỏi sâu → mở chatbot: *"Thương lái trả 12.000đ/kg gạo ST25, giá này thế nào?"*
- AI trả lời: *"Sản lượng gạo Thái Lan giảm 15% (USDA). Thuế EU 0% (EVFTA). Giá FOB xuất khẩu ~20.400đ/kg. Giá 12.000đ thấp hơn 41% so với giá xuất khẩu."*
- Trưởng HTX tự biết 12.000đ là thấp, đàm phán lại.

**Kịch bản 2 — Pain Point 2: "Bán ở đâu"**
- Trưởng HTX mở bản đồ → thấy 5 DN thu mua, 3 thương lái, 2 kho bãi quanh vùng.
- Bấm vào DN "Lộc Trời" → thấy SĐT, loại nông sản chủ yếu thu mua.
- Trưởng HTX gọi điện đàm phán trực tiếp.

**Kịch bản 3 — Pain Point 3+4: "Chứng minh chất lượng"**
- Cán bộ KT/CL mở bản đồ vùng trồng → thấy toàn cảnh 120 thửa đất, màu sắc phân biệt theo loại cây.
- Bấm vào thửa A3 → xem nhật ký canh tác: 10 entries ghi đầy đủ từ gieo trồng đến phun thuốc.
- Kiểm tra thời gian cách ly → đạt → duyệt cho phép thu hoạch.
- Sau thu hoạch, gộp thành Lô `MĐ2-ST25-20260720-001` → hệ thống sinh QR.
- DN thu mua quét QR → thấy toàn bộ lịch sử: HTX nào, ai trồng, phun thuốc gì ngày nào, thời tiết ra sao → tin tưởng → mua giá cao.

**Kịch bản 4 — Pain Point 6: "Sâu bệnh hỏi ai"**
- Nông dân Minh ngoài đồng thấy lá lúa bị đốm nâu bất thường.
- Mở web → bấm "Chẩn đoán bệnh" → chụp ảnh lá → chọn Thửa A3.
- Model AI trả về: *"Bệnh Đạo ôn (Blast) — độ tin cậy 95%"*
- Bấm [Gửi cho Cán bộ KT] → Cán bộ Trần Văn B nhận notification ngay lập tức.
- Cán bộ KT xác nhận chẩn đoán → ghi vào nhật ký thửa → phản hồi lại nông dân.

---

### VII. GHI CHÚ BRAINSTORM

#### Các quyết định quan trọng đã chốt:
1. **AI không ra quyết định** — chỉ trình bày sự thật có nguồn.
2. **HTX không tự xuất khẩu** — reframe từ "chiến lược xuất khẩu" sang "chống ép giá bằng thông tin".
3. **Bản tin dạng tin tức** — metaphor quen thuộc (bản tin VTV/đài phát thanh), không phải dashboard phân tích phức tạp.
4. **Audio bản tin** — TTS MNM (Piper/Coqui), giải quyết accessibility cho user ngoài đồng.
5. **Channel-agnostic notification** — lõi MNM, connector tuỳ chọn, không lock-in vào bất kỳ nền tảng nào.
6. **Bản đồ thay sàn** — không phát sinh thêm actor, Trưởng HTX tự quản lý data đối tác.
7. **Profile HTX** — filter bản tin & notification, KHÔNG filter bản đồ.
8. **Web responsive** — tối ưu điện thoại, chưa làm mobile app (giới hạn 2 tháng).
9. **Keycloak OTP** — giữ Keycloak, cấu hình OTP qua SĐT thay vì username+password.
10. **Đổi Kỹ sư NN → Cán bộ KT/CL** — phản ánh đúng thực tế HTX, có pain point rõ ràng.
11. **HTX kiểu mới** — hệ thống nhắm vào HTX vận hành thực sự, đồng thời hỗ trợ HTX cũ chuyển đổi.
12. **Nhật ký canh tác không theo chuẩn VietGAP** — tự do ghi nhưng có bộ quy tắc tối thiểu.
13. **QR truy xuất theo lô hàng** — quy lô theo ngày thu hoạch, luồng 6 bước với pre-review.
14. **UI riêng từng role** — mỗi actor thấy giao diện khác nhau, không nhầm lẫn.
15. **2 Chatbot** — Trưởng HTX (thị trường/giá) và Cán bộ KT/CL (kỹ thuật/tài liệu). Cùng Ollama, khác prompt + RAG.
16. **Copernicus Sentinel-2** — ảnh vệ tinh làm layer nền bản đồ vùng trồng (CC BY 4.0).
17. **Auto-calculate diện tích** — Leaflet.draw + Turf.js tự tính từ polygon.
18. **Notification cross-actor** — Cán bộ KT/CL duyệt/xuất QR → notification đến Trưởng HTX trên web.
19. **Phân quyền hộ/thửa** — Cán bộ KT/CL CRUD, Trưởng HTX read-only.
20. **Nông dân web responsive** — không Zalo Mini App (SDK proprietary). PWA là hướng mở rộng.
21. **Model chẩn đoán bệnh** — TensorFlow/Keras tự train, deploy qua FastAPI. Khớp nguyên tắc AI (trình bày kết quả, không quyết định).
22. **Dashboard "Hôm nay"** — tổng hợp data đã có (thời tiết, giá, thửa đất, thông báo) trên 1 trang.
23. **Inbox riêng** — thông báo đến đúng người, không trôi trong nhóm chat.
24. **TTS cho mọi element** — accessibility cho nông dân già.
25. **Profile HTX nhập tay tạm** — cho nhập tay trước, auto-calculate khi có data vùng trồng. Bản tin default hiện tất cả khi chưa có data.
26. **Chat history 7 ngày** — cả 2 chatbot (Thị trường + Kỹ thuật) đều lưu 7 ngày gần nhất.
27. **Sửa/Xoá đối tác** — bấm marker → popup info + [Sửa] [Xoá]. Xoá cần xác nhận.
28. **Trạng thái thửa trên map** — 4 trạng thái (gieo/chăm sóc/nghiệm thu/thu hoạch) phân biệt bằng màu. Filter multi-choice theo trạng thái + cây trồng.
29. **Tạo thông báo broadcast** — Trưởng HTX gửi xuống Cán bộ + Nông dân. Cán bộ gửi xuống Nông dân. Nông dân gửi lên Cán bộ qua chức năng.
30. **Luồng CRUD hộ/thửa** — Hộ → Thửa → Cây trồng (tuần tự).
31. **Cán bộ tự ghi auto approved** — validate đủ trường bắt buộc → auto approved. Chỉ entry từ Nông dân mới "Chờ duyệt".
32. **Không phun thuốc** — trường "Không sử dụng thuốc BVTV" + auto ĐẠT cách ly + QR ghi tương ứng.
33. **Chatbot Kỹ thuật** — Tính năng 3.5 cho Cán bộ KT/CL, scope kỹ thuật canh tác + tài liệu HTX, RAG từ P.A.R.A.
34. **Giá nông sản cho nông dân = mock data nội địa** — vì giá FOB xuất khẩu không có ích. Tạm mock.
35. **Dashboard "Hôm nay" cho cả 3 role** — Trưởng HTX, Cán bộ, Nông dân đều có, nội dung tuỳ role.
36. **Thu hồi entry chờ duyệt** — nông dân bấm [Thu hồi] khi "Chờ duyệt" để sửa rồi gửi lại. "Đã duyệt" = read-only.
37. **AI confidence < 60%** — cảnh báo "Ảnh có thể chưa rõ" + luôn ghi "đây là AI dự đoán".
38. **OTP ghi chú** — hiện "Mã OTP có hiệu lực trong 5 phút" trên màn hình nhập OTP.
39. **Xem Lô hàng (Trưởng HTX)** — Tính năng 2.4, read-only, filter theo trạng thái, deep-link từ notification.
40. **Gửi Thông báo KT (Cán bộ)** — Tính năng 3.6, form gửi thông báo kỹ thuật xuống Nông dân (+ tuỳ chọn Trưởng HTX).
41. **Trạng thái thửa auto-derive** — suy từ nhật ký, không cần nút chuyển tay. Reset khi vụ mới.
42. **Nhật ký bệnh trên Dashboard Nông dân** — link trực tiếp từ Dashboard "Hôm nay" tới nhật ký bệnh hộ mình.

#### Conflict đã giải quyết:
- Bản tin vs Chatbot: tách biệt — bản tin là push hàng ngày trên web, chatbot là pull khi cần trên web.
- AI anomaly detection: chuyển từ "cảnh báo" sang "notification", AI tự đánh giá quan trọng.
- Profile filter vs Bản đồ không lọc: không mâu thuẫn.
- 2 bản đồ (vùng trồng vs đối tác): UI riêng từng role, không nhầm.
- Data trùng Profile vs Vùng trồng: Profile nhập tay tạm → auto-calculate từ thửa đất.
- P.A.R.A RAG vs Chatbot scope: tách 2 chatbot riêng.
- CRUD hộ/thửa: Cán bộ CRUD (Hộ→Thửa→Cây), Trưởng read-only + filter + notification.
- Zalo Mini App: không MNM → dùng web responsive/PWA.
- Nhật ký nông dân: gửi → Cán bộ duyệt → auto-fill nhật ký chính thức. Nông dân read-only sau "Đã duyệt". Có [Thu hồi] khi "Chờ duyệt".
- Nhật ký bệnh riêng: Cán bộ thấy tất cả + lọc, nông dân thấy hộ mình. Chỉ ghi nhận, xử lý tuỳ hành động ngoài đời.
- Notification: n8n + web bell cho cả 3 actor, content khác nhau. Trưởng→Cán bộ+Nông dân, Cán bộ→Nông dân, Nông dân→Cán bộ qua chức năng.
- Giá cho nông dân: mock data nội địa, giá nông sản đang trồng, không phân tích sâu.
- AI chẩn đoán: luôn ghi "AI dự đoán", confidence < 60% → cảnh báo.

#### Brainstorm hoàn tất:
- [x] Trưởng HTX ✅
- [x] Cán bộ KT/CL ✅
- [x] Nông dân ✅
- [x] Duyệt conflict Trưởng HTX vs Cán bộ KT/CL ✅
- [x] Duyệt conflict toàn bộ 3 actor ✅
- [x] Duyệt luồng tính năng (walkthrough 14 issues) ✅
- [ ] Kỹ thuật brainstorming tiếp theo: Six Thinking Hats, Pre-Mortem, SCAMPER
