# BÀI TOÁN NGHIỆP VỤ (BUSINESS ANALYSIS DOCUMENT)
## DỰ ÁN: DX-AGRIMARKET (HỆ ĐIỀU HÀNH SỐ NÔNG NGHIỆP)

Mục tiêu tài liệu: Tài liệu này định nghĩa tầm nhìn, kiến trúc nghiệp vụ và yêu cầu hệ thống cho dự án DX-AgriMarket, bám sát bộ khung lý thuyết Hệ điều hành Doanh nghiệp Số (DX-OS) của VFOSSA dành cho cuộc thi OLP Tin học sinh viên (Phần mềm Nguồn mở).

### I. TỔNG QUAN DỰ ÁN (PROJECT OVERVIEW)

#### 1.1. Bối cảnh & Vấn đề (Context & Problem)
- **Vấn đề cốt lõi:** Nông nghiệp Việt Nam liên tục đối mặt với điệp khúc "Được mùa mất giá, được giá mất mùa". Nguyên nhân gốc rễ là do Hợp tác xã (HTX) và Nông dân tổ chức sản xuất dựa trên **cảm tính và thông tin cục bộ**, thiếu tầm nhìn vĩ mô về chuỗi cung ứng toàn cầu và biến đổi khí hậu.
- **Điểm nghẽn công nghệ:** Các HTX thiếu một "Hệ điều hành" thực thụ để hội tụ dữ liệu (Single Source of Truth) từ các tổ chức quốc tế nhằm ra quyết định (Data-driven decision making).

#### 1.2. Giải pháp (Solution)
Xây dựng **DX-AgriMarket** – một Hệ điều hành Nông nghiệp Số (Agri-OS) tuân thủ 100% chuẩn Nguồn Mở. Hệ thống sẽ tự động cào (crawl) và phân tích dữ liệu thị trường, khí hậu toàn cầu (Public Domain) để đưa ra khuyến nghị canh tác vĩ mô cho Trưởng HTX, giúp cân bằng cung - cầu.

### II. MÔ HÌNH KIẾN TRÚC NGHIỆP VỤ DỰA TRÊN HPDI (DX-OS)

Dự án áp dụng triệt để mô hình **Human - Process - Data - Intelligence (HPDI)** từ tài liệu gốc của cuộc thi.

#### 2.1. Lớp [H] - Human Space (Không gian Tương tác)
Nơi con người giao tiếp với hệ thống.
- **Người dùng (Actors):**
  - **Trưởng HTX / Ban giám đốc:** Xem Dashboard chiến lược (Metabase), nhận khuyến nghị về sản lượng.
  - **Kỹ sư Nông nghiệp:** Tra cứu tài liệu (P.A.R.A), cập nhật tri thức sâu bệnh.
  - **Nông dân:** Nhận cảnh báo thời tiết/dịch bệnh qua tin nhắn (Mattermost/Zalo).
- **Công nghệ lõi:** Next.js (Web Portal tập trung) kết nối với hệ thống SSO Keycloak (Phân quyền bảo mật tuyệt đối).

#### 2.2. Lớp [P] - Process Space (Không gian Quy trình)
Tự động hóa các luồng nghiệp vụ (Automation), loại bỏ sức người trong việc tổng hợp báo cáo.
- **Nghiệp vụ cốt lõi:** Tự động hóa quá trình kéo API dữ liệu quốc tế mỗi ngày lúc 00:00, làm sạch dữ liệu và đẩy vào Data Warehouse.
- **Công nghệ lõi:** n8n (Được DX-OS khuyên dùng) đóng vai trò là "Nhạc trưởng" (Orchestrator) kết nối các dịch vụ.

#### 2.3. Lớp [D] - Data Space (Không gian Dữ liệu & Tài sản số)
Áp dụng kỷ luật "Chủ quyền Dữ liệu" theo chuẩn DX-OS.
- **Dữ liệu có cấu trúc (Database):** PostgreSQL lưu trữ các API thời gian thực.
  - Nguồn Cung-Cầu: USDA PSD & GATS (Bộ Nông nghiệp Hoa Kỳ - Public Domain).
  - Nguồn Sản lượng & Môi trường: FAOSTAT (CC BY 4.0).
  - Nguồn Khí hậu: NASA POWER (Public Domain).
- **Dữ liệu phi cấu trúc (Files/Docs):** Tổ chức theo cấu trúc P.A.R.A (Projects - Areas - Resources - Archives) trên hệ thống đám mây nội bộ (VD: MinIO / Nextcloud).

#### 2.4. Lớp [I] - Intelligence Space (Không gian Trí tuệ)
Tiến tới doanh nghiệp AI-Native.
- **Nghiệp vụ AI:** đọc dữ liệu Cung-Cầu từ lớp [D] để phân tích: "Thái Lan đang hạn hán, sản lượng gạo toàn cầu sụt giảm. Khuyến nghị HTX tăng 20% diện tích trồng lúa trong vụ tới."
- **Công nghệ lõi:** Ollama (chạy AI Local) kết hợp với biểu đồ tri thức Wikidata (CC0) để lý luận và tự động gửi tin nhắn cảnh báo qua Mattermost.

### III. DANH SÁCH TÍNH NĂNG CHÍNH (KEY FEATURES)

#### 1. Tính năng 1: Bảng điều khiển Thương mại Vĩ mô (Macro & Trade Dashboard)
- **Mô tả:** Thay vì chỉ quản lý nội bộ, Trưởng HTX mở Dashboard sẽ theo dõi được 3 bức tranh toàn cầu: (1) So sánh sản lượng nông sản của HTX so với các cường quốc đối thủ (kéo từ USDA/FAOSTAT); (2) Bảng theo dõi Thuế quan xuất khẩu (kéo từ WTO/WITS); (3) Biến động tỷ giá ngoại tệ thời gian thực (kéo từ ExchangeRate API). Mọi dữ liệu hội tụ tại một Nguồn sự thật duy nhất (Single Source of Truth).

#### 2. Tính năng 2: Trợ lý AI Tư vấn Chiến lược Xuất khẩu (AI Export Strategy Advisory)
- **Mô tả:** Đây là tính năng "sát thủ" của hệ thống. Trưởng HTX bấm nút "Tạo chiến lược xuất khẩu". Hệ thống n8n tự động kích hoạt AI (Ollama Local) tổng hợp đa luồng dữ liệu để lý luận.
- **Đầu ra (Output):** AI tự động phân tích và in ra báo cáo: "Sản lượng gạo EU đang thiếu hụt (USDA). Thuế nhập khẩu gạo vào EU đang ở mức 0% theo EVFTA (WTO). Tỷ giá EUR/VND đang có lợi (Finance API). Khuyến nghị HTX ưu tiên ký hợp đồng xuất khẩu gạo ST25 sang Châu Âu để tối đa hóa biên lợi nhuận."

#### 3. Tính năng 3: Cảnh báo Thời tiết Kép (Macro & Micro Weather Alerts)
- **Mô tả:** Tính năng bảo vệ mùa màng tự động. Hệ thống n8n hoạt động ngầm kết hợp 2 nguồn dữ liệu khí hậu: NASA POWER (để dự báo vĩ mô dài hạn như El Nino, Hạn mặn) và Open-Meteo API (để dự báo vi mô theo giờ).
- **Đầu ra (Output):** Khi phát hiện có nguy cơ mưa đá hoặc độ ẩm tăng vọt gây nấm bệnh tại tọa độ của HTX, hệ thống tự động bắn tin nhắn cảnh báo khẩn cấp vào kênh chat (Mattermost/Zalo) của nhóm Nông dân.

#### 4. Tính năng 4: Quản trị Tài sản số HTX theo chuẩn P.A.R.A (Digital Asset Management)
- **Mô tả:** Xóa bỏ tình trạng lưu trữ file rác lộn xộn. Giao diện quản lý file của HTX buộc phải tuân thủ nghiêm ngặt cấu trúc P.A.R.A (Projects - Areas - Resources - Archives).
- **Đầu ra (Output):** Tách bạch rạch ròi giữa Dữ liệu Mùa vụ, Chứng từ Kế toán, và Tài liệu Kỹ thuật. Dữ liệu sạch này không chỉ phục vụ truy xuất nguồn gốc nông sản (Blockchain/Archives) mà còn làm tài liệu nền (RAG) để Trợ lý AI học hỏi liên tục.

### IV. MA TRẬN PHÁP LÝ NGUỒN MỞ (LICENSE COMPLIANCE MATRIX)

> Đây là "Vũ khí bí mật" để đạt điểm tối đa từ Ban giám khảo, chứng minh đội thi am hiểu sâu sắc về Luật Bản quyền (Copyright) và Giấy phép Nguồn mở (Open Source Licensing).

| Lớp kiến trúc | Thành phần | Giấy phép | Đánh giá mức độ tuân thủ OLP |
| :--- | :--- | :--- | :--- |
| H (Presentation) | Next.js, React | MIT | Đạt |
| H (Security) | Keycloak | Apache License 2.0 | Đạt |
| P (Process) | n8n | Faircode | Đạt theo chuẩn DX-OS |
| D (Data Storage) | PostgreSQL, MinIO | PostgreSQL License, AGPL | Đạt |
| D (Analytics) | Metabase | AGPL | Đạt |
| D (Market Data) | USDA PSD API, GATS API | Public Domain | Đạt (Miễn trừ bản quyền) |
| D (Climate Data) | NASA POWER API | Public Domain | Đạt (Miễn trừ bản quyền) |
| D (Agricultural Data) | FAOSTAT API | CC BY 4.0 | Đạt |
| I (Knowledge Base) | Wikidata | CC0 1.0 | Đạt (Public Domain) |

#### Các API Bổ sung cho Dự án (Đề xuất tích hợp thêm):
- **Thuế quan Thương mại & Xuất Nhập Khẩu Quốc tế:**
  - **WTO Tariff Download Facility API:** Cung cấp toàn bộ mức thuế quan, giúp AI biết mức thuế áp dụng là bao nhiêu phần trăm.
  - **World Bank WITS API:** Hệ thống WITS truy cập kho dữ liệu về Thuế quan quốc tế và các Biện pháp phi thuế quan (Open Data CC BY 4.0).
- **API Tỷ giá hối đoái (Finance):**
  - **ExchangeRate-API / Frankfurter:** Giúp AI tính toán lợi nhuận thực tế cho HTX bằng VNĐ theo thời gian thực để so sánh biên lợi nhuận giữa các quốc gia.
- **API Thời tiết Vi mô (Weather):**
  - **Open-Meteo:** API mã nguồn mở (không cần API Key) dự báo thời tiết vi mô theo giờ. Kết hợp với NASA POWER (vĩ mô) để cảnh báo chính xác cho nông dân.
- **API Tin tức Nông nghiệp (News/Open Data):**
  - **GNews / Mediastack:** Tự động cào tin tức thế giới (ví dụ "Rice shortage" hay "Durian export") làm tài liệu nền (RAG) cho AI lập luận chuẩn như một chuyên gia kinh tế.

### V. CHIẾN LƯỢC TRIỂN KHAI & TÍNH KHẢ THI (ROADMAP)

Thay vì cố gắng code một hệ thống đồ sộ không chạy được, dự án áp dụng chiến lược "Tích hợp thay vì xây mới" (Integration over coding):
1. Sử dụng Docker Compose để dựng các core services (Keycloak, Postgres, n8n, Mattermost) trong 1 ngày.
2. Viết luồng n8n kéo API USDA và NASA (Mất 1 tuần).
3. Tập trung toàn bộ thời gian code Frontend (Next.js) tạo giao diện "Wow" và gắn Metabase Dashboard vào.

*Bản lề nghiệp vụ này đảm bảo một dự án không chỉ hoàn hảo về công nghệ Nguồn mở, đúng chuẩn đề thi DX-OS, mà còn có tính ứng dụng thực tiễn vĩ mô cực kỳ sâu sắc.*

### VI. BÓC TÁCH NGHIỆP VỤ

#### GIAI ĐOẠN 1: THIẾT LẬP NỀN TẢNG (FOUNDATION)
**Mục tiêu:** Dựng xong khung sườn hệ thống, user có thể đăng nhập và dữ liệu bắt đầu tự động chảy về cơ sở dữ liệu.

1. **Luồng Xác thực & Phân quyền (Auth Flow) - [Lớp H]**
   - **Mô tả:** Người dùng đăng nhập vào Cổng thông tin (Portal) của Hợp tác xã thông qua hệ thống bảo mật tập trung Keycloak.
   - **Trang giao diện (UI Pages) cần code trong Next.js:**
     - Trang Đăng nhập / Đăng ký (Dùng giao diện mặc định của Keycloak cho nhanh).
     - Trang Điều hướng chung (Landing/Home): Hiển thị lời chào và menu chức năng tùy theo quyền (Trưởng HTX thấy menu Báo cáo, Nông dân thấy menu Thời tiết).
   - **Tính năng cốt lõi:** Tích hợp Next-Auth với Keycloak OIDC.

2. **Luồng Thu thập Dữ liệu Vĩ mô (Data Ingestion Flow) - [Lớp P & D]**
   - **Mô tả:** Hệ thống tự động đi lấy dữ liệu từ các tổ chức quốc tế mang về lưu tại nhà.
   - **Trang giao diện:** Không có giao diện người dùng. (Chỉ là màn hình kéo thả bên trong công cụ n8n).
   - **Tính năng cốt lõi (Làm trên n8n):**
     - Tạo Workflow 1: Mỗi 00:00 đêm, gọi API USDA lấy sản lượng Lúa Gạo, Sầu Riêng ➔ Lưu vào bảng `usda_production` trong PostgreSQL.
     - Tạo Workflow 2: Mỗi 00:00 đêm, gọi API WTO lấy biểu thuế xuất khẩu sang EU, Trung Quốc ➔ Lưu vào bảng `wto_tariffs` trong PostgreSQL.
     - Tạo Workflow 3: Mỗi 1 tiếng, gọi API ExchangeRate lấy tỷ giá USD/VND, EUR/VND ➔ Lưu vào bảng `exchange_rates`.

#### GIAI ĐOẠN 2: TÍNH NĂNG "ĂN TIỀN" (CORE VALUE - DEMO OLP)
**Mục tiêu:** Đưa dữ liệu ra màn hình và dùng AI để tư vấn. Đây là phần mang lên sân khấu thuyết trình.

3. **Luồng Giám sát Thị trường Vĩ mô (Macro-Dashboard Flow) - [Lớp H & D]**
   - **Mô tả:** Trưởng HTX xem các biểu đồ trực quan để biết thế giới đang thừa/thiếu nông sản gì.
   - **Trang giao diện (UI Pages) cần làm:**
     - Trang Dashboard Tổng quan: Layout gồm các Widget biểu đồ.
     - Trang Phân tích Xuất khẩu: Hiển thị bảng so sánh Thuế quan & Tỷ giá giữa các thị trường (EU, Trung Quốc, Mỹ).
   - **Tính năng cốt lõi:** Dùng Metabase kết nối vào Postgres để vẽ biểu đồ ➔ Nhúng (Embed) biểu đồ đó qua iframe vào trang Next.js.

4. **Luồng Trợ lý Trí tuệ Nhân tạo (AI Advisory Flow) - [Lớp I]**
   - **Mô tả:** Người dùng đặt câu hỏi hoặc bấm nút tạo báo cáo, AI sẽ đọc dữ liệu và trả lời.
   - **Trang giao diện (UI Pages) cần làm:**
     - Trang Trợ lý AI (Chatbot UI): Giao diện chat tương tự ChatGPT, hoặc đơn giản hơn là một nút bấm "Tạo chiến lược xuất khẩu mùa vụ".
   - **Tính năng cốt lõi:**
     - Viết 1 API backend trong Next.js nhận câu hỏi từ UI.
     - API này gửi lệnh cho Ollama (AI Local) kèm theo dữ liệu mới nhất (Thuế 0% EU, Tỷ giá 27k) được query từ Postgres.
     - Ollama sinh ra đoạn văn bản tư vấn và trả về màn hình cho người dùng đọc.

#### GIAI ĐOẠN 3: TÍNH NĂNG MỞ RỘNG (EXTENSIONS)
**Mục tiêu:** Làm cho hệ thống khổng lồ và hoàn thiện hơn. Chỉ làm nếu team code rất nhanh và còn dư thời gian.

5. **Luồng Cảnh báo Thời tiết Vi mô (Micro-Weather Alert)**
   - **Mô tả:** Tự động nhắn tin báo mưa bão cho nông dân.
   - **Trang giao diện:** Không cần UI trên Next.js. Giao diện hiển thị chính là phần mềm chat (Mattermost hoặc Zalo).
   - **Tính năng cốt lõi:** n8n gọi API Open-Meteo mỗi giờ. Nếu thấy có mưa > 80%, dùng Node Mattermost/Zalo bắn tin nhắn vào group chat của HTX.

6. **Luồng Quản trị Tài nguyên P.A.R.A (Document Management)**
   - **Mô tả:** Nơi lưu trữ tài liệu chuẩn hóa.
   - **Trang giao diện (UI Pages) cần làm:**
     - Trang Kho Tài nguyên (File Manager): Hiển thị 4 thư mục lớn P, A, R, A. Cho phép upload/download file tài liệu, chứng từ thuế.
   - **Tính năng cốt lõi:** Tích hợp UI Next.js với MinIO/Nextcloud API để lưu trữ file.

### VII. CẤU TRÚC LƯU TRỮ VÀ MÃ NGUỒN
(Chi tiết cấu trúc cây thư mục mã nguồn và lưu trữ tài sản số theo chuẩn P.A.R.A đã được khởi tạo trong dự án thực tế tại `Kho_Tai_Nguyen_HTX`).

### VIII. BỔ SUNG NGHIỆP VỤ & KỊCH BẢN DEMO THỰC TẾ

#### 1. Chi tiết Người dùng (Actors)
- **Trưởng HTX (Manager):** Quyền cao nhất. Xem Dashboard chiến lược (Metabase), nhận khuyến nghị tỷ giá/thuế quan từ AI.
- **Kỹ sư Nông nghiệp (Engineer):** Cập nhật dữ liệu tồn kho, tra cứu/tải tài liệu lên kho P.A.R.A.
- **Nông dân (Farmer):** Nhận cảnh báo thời tiết (Mattermost/Zalo), giao diện web tối giản chỉ có tính năng báo cáo hình ảnh đồng ruộng.

#### 2. Chi tiết Lớp Dữ Liệu [D] và Trí Tuệ [I]
- **Dữ liệu Bên ngoài (APIs kéo về bởi n8n):**
  - Nguồn Cung-Cầu: USDA PSD (Public Domain).
  - Thuế quan Quốc tế: WTO / WITS API (Open Data).
  - Khí hậu vi mô: Open-Meteo (Open Data).
  - Tài chính: ExchangeRate API.
- **Dữ liệu Nội bộ (Chủ quyền dữ liệu):**
  - Tồn kho & Logistics: Bảng `warehouse_inventory` trên PostgreSQL do Kỹ sư HTX tự cập nhật.
  - Tài liệu (Files/Docs): Tổ chức theo cấu trúc P.A.R.A trên đám mây nội bộ (MinIO).
- **Lớp Trí Tuệ [I]:** 
  - Ollama (chạy AI Local) kết hợp với kỹ thuật RAG đọc tài liệu P.A.R.A để đảm bảo kiến thức tư vấn chuẩn xác 100%.

#### 3. Cập nhật 4 Tính năng cốt lõi (Kịch bản Demo)
1. **Bảng điều khiển Thương mại Vĩ mô (Macro & Trade Dashboard):** Trưởng HTX mở Dashboard sẽ theo dõi được: (1) Sản lượng đối thủ (USDA); (2) Thuế quan xuất khẩu (WTO); (3) Biến động tỷ giá (Finance API). Mọi dữ liệu hội tụ tại một Nguồn sự thật duy nhất qua biểu đồ trực quan của Metabase.
2. **Trợ lý AI Tư vấn Quyết định Logistics & Bán hàng (AI Advisory):** 
   - *Kịch bản Demo:* Trưởng HTX nhập: "Thương lái đang ép giá thu mua 500 tấn Gạo ST25 tại kho. Kho đang đầy 80%. Có nên bán không?"
   - *Output:* AI tổng hợp dữ liệu và trả lời: "KHÔNG NÊN BÁN HẾT. Nguồn cung toàn cầu đang thiếu hụt (USDA), thuế EU giảm (WTO), tỷ giá có lợi. Đồng thời dự báo thời tiết 3 ngày tới mưa lớn (Open-Meteo) và sức chứa kho có hạn. Khuyến nghị: Bán 30% để giải phóng kho chống ẩm mốc, giữ lại 70% chủ động chào bán cho Tập đoàn lớn với giá cao hơn 15%." (Phá vỡ thế độc quyền của thương lái).
3. **Cảnh báo Thời tiết Kép Đa kênh (Omnichannel Weather Alerts):** Luồng n8n liên tục gọi Open-Meteo API (thời tiết vi mô) để tự động bắn tin nhắn vào kênh chat (Mattermost/Zalo) của Nông dân khi phát hiện rủi ro mưa đá hoặc giông bão cục bộ, giúp bảo vệ mùa màng.
4. **Quản trị Tài sản số HTX theo chuẩn P.A.R.A:** Tách bạch rạch ròi giữa Dữ liệu Mùa vụ (Projects) và Tài liệu Kỹ thuật (Resources). Dữ liệu sạch này phục vụ truy xuất nguồn gốc (Archives) và làm tài liệu nền (RAG) để AI học hỏi.
