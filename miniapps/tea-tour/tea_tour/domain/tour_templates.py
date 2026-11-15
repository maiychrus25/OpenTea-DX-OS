# SPDX-License-Identifier: MIT
# SPDX-FileCopyrightText: 2026 OpenTea Developers
"""Four starting points for a new tour (spec Appendix B). The manager edits everything before publishing."""
from dataclasses import dataclass


@dataclass(frozen=True)
class TourTemplate:
    key: str
    title: str
    category: str
    duration_minutes: int
    summary: str
    description: str
    itinerary: tuple[dict, ...]
    includes: tuple[str, ...]
    excludes: tuple[str, ...]
    bring: tuple[str, ...]
    faq: tuple[dict, ...]
    price_adult_vnd: int
    price_child_vnd: int
    default_seats: int


def _step(time: str, title: str, detail: str) -> dict:
    return {"time": time, "title": title, "detail": detail}


def _qa(q: str, a: str) -> dict:
    return {"q": q, "a": a}


TEMPLATES: dict[str, TourTemplate] = {t.key: t for t in (
    TourTemplate(
        key="picking", title="Một ngày làm người hái chè", category="PICKING", duration_minutes=240,
        summary="Cùng nông hộ hái chè búp trên đồi, học cách chọn một tôm hai lá và uống ly trà đầu tiên do chính mình hái.",
        description=("Buổi sáng trên đồi chè bắt đầu cùng người trồng chè. Bạn được hướng dẫn cách chọn búp chè đúng "
                     "chuẩn (một tôm hai lá), cách hái để cây ra búp đều, rồi tự tay hái một giỏ chè nhỏ.\n\n"
                     "Sau khi hái, bạn xem chè tươi được sơ chế và thưởng thức tách trà vừa pha. Tour phù hợp với gia đình "
                     "có trẻ nhỏ và nhóm bạn muốn một buổi sáng chậm rãi giữa đồi chè."),
        itinerary=(
            _step("07:30", "Đón khách tại điểm hẹn", "Gặp người dẫn, nhận nón lá và giỏ hái, nghe giới thiệu ngắn về đồi chè."),
            _step("08:00", "Đi bộ lên đồi", "Đi bộ khoảng 15 phút trên đường mòn giữa các luống chè, dừng chụp ảnh."),
            _step("08:30", "Học và thực hành hái chè", "Người dẫn chỉ cách chọn búp một tôm hai lá; mỗi người tự hái một giỏ nhỏ."),
            _step("10:00", "Sơ chế chè tươi", "Xem chè được phơi, héo và sơ chế ngay tại nhà nông hộ."),
            _step("10:45", "Thưởng trà và kết thúc", "Uống trà nóng cùng bánh nhẹ, mua chè làm quà nếu muốn."),
        ),
        includes=("Người dẫn là nông hộ địa phương", "Nón lá và giỏ hái", "Trà và bánh nhẹ", "Nước uống"),
        excludes=("Chi phí đi lại tới điểm hẹn", "Chè mua làm quà", "Chi tiêu cá nhân"),
        bring=("Giày hoặc dép đế bám", "Áo dài tay mỏng", "Kem chống nắng", "Nước uống cá nhân"),
        faq=(_qa("Trẻ em mấy tuổi tham gia được?", "Trẻ từ 4 tuổi đi cùng người lớn là phù hợp. Trẻ dưới 4 tuổi được miễn phí nếu không chiếm chỗ riêng, vui lòng hỏi HTX."),
             _qa("Trời mưa thì sao?", "HTX sẽ gọi báo nếu phải dời lịch vì mưa lớn; bạn có thể đổi sang chuyến khác hoặc được hoàn tiền đã trả."),
             _qa("Tour có phù hợp người lớn tuổi không?", "Có. Đường lên đồi ngắn và có chỗ nghỉ; hãy báo trước để người dẫn đi chậm hơn.")),
        price_adult_vnd=250_000, price_child_vnd=150_000, default_seats=12),
    TourTemplate(
        key="crafting", title="Sao chè thủ công và thưởng trà", category="CRAFTING", duration_minutes=180,
        summary="Tự tay sao chè trên chảo, vò và sấy chè, rồi thưởng thức chính mẻ chè mình làm cùng người thợ lành nghề.",
        description=("Tour dành cho người muốn hiểu vì sao chè thơm. Bạn thử các bước sao chè thủ công: diệt men trên chảo "
                     "nóng, vò chè, sấy khô, mỗi bước có người thợ lành nghề cầm tay chỉ việc.\n\n"
                     "Cuối buổi, bạn thưởng trà ở nhiều độ chè khác nhau để nhận ra hương vị, và mang về một gói chè nhỏ "
                     "do chính mình làm."),
        itinerary=(
            _step("14:00", "Đón khách và giới thiệu", "Nghe câu chuyện nghề chè của gia đình và xem dụng cụ sao chè."),
            _step("14:20", "Diệt men trên chảo", "Thử đảo chè trên chảo nóng dưới sự hướng dẫn của người thợ."),
            _step("15:00", "Vò và sấy chè", "Vò chè cho tróc nước, sấy khô để giữ hương."),
            _step("15:45", "Thưởng trà", "Pha và so sánh ba loại trà, học cách pha trà đúng nhiệt độ."),
            _step("16:30", "Nhận chè mang về", "Đóng gói phần chè do mình làm, chụp ảnh lưu niệm."),
        ),
        includes=("Người thợ chè hướng dẫn", "Nguyên liệu chè tươi", "Ba loại trà thưởng thức", "Một gói chè tự làm mang về"),
        excludes=("Chi phí đi lại tới điểm hẹn", "Chè mua thêm", "Chi tiêu cá nhân"),
        bring=("Trang phục gọn gàng", "Tóc buộc gọn", "Tinh thần thích khám phá"),
        faq=(_qa("Sao chè có nóng và nguy hiểm không?", "Người thợ luôn đứng cạnh và chỉ cho bạn thao tác an toàn. Trẻ em chỉ xem và vò chè, không đứng gần chảo nóng."),
             _qa("Mỗi buổi có tối đa bao nhiêu người?", "Số chỗ mỗi chuyến được giới hạn để mọi người đều được thực hành; xem số chỗ còn lại ở bảng chuyến."),
             _qa("Tôi có mua thêm chè được không?", "Được. Chè của HTX bán tại chỗ, thanh toán tiền mặt hoặc chuyển khoản.")),
        price_adult_vnd=320_000, price_child_vnd=200_000, default_seats=10),
    TourTemplate(
        key="sunrise", title="Bình minh trên đồi chè", category="SIGHTSEEING", duration_minutes=150,
        summary="Dậy sớm đón bình minh, ngắm sương tan trên những luống chè và chụp ảnh với nón lá cùng người dẫn địa phương.",
        description=("Chuyến đi ngắn dành cho người thích ảnh và cảnh đẹp. Bạn lên đồi từ lúc trời chưa sáng, đứng trên "
                     "điểm cao nhất để thấy sương tan và ánh nắng đầu ngày phủ lên các luống chè.\n\n"
                     "Người dẫn biết những góc chụp đẹp nhất theo từng mùa và giúp bạn có bộ ảnh đáng nhớ; kết thúc bằng "
                     "bữa sáng nhẹ và tách trà nóng."),
        itinerary=(
            _step("05:00", "Tập trung và lên đồi", "Đi bộ với đèn pin lên điểm ngắm cảnh, khoảng 20 phút."),
            _step("05:30", "Đón bình minh", "Chờ mặt trời mọc, ngắm sương tan trên đồi chè."),
            _step("06:15", "Chụp ảnh", "Người dẫn chỉ các góc chụp đẹp; mượn nón lá để chụp ảnh."),
            _step("07:00", "Điểm tâm trên đồi", "Dùng trà nóng và bữa sáng nhẹ kiểu địa phương."),
            _step("07:30", "Kết thúc", "Đi xuống đồi và chia tay tại điểm hẹn."),
        ),
        includes=("Người dẫn địa phương", "Trà nóng và bữa sáng nhẹ", "Mượn nón lá chụp ảnh"),
        excludes=("Chi phí đi lại tới điểm hẹn", "Chi tiêu cá nhân"),
        bring=("Áo khoác ấm", "Đèn pin hoặc điện thoại có đèn", "Giày thoải mái", "Máy ảnh hoặc điện thoại"),
        faq=(_qa("Sáng sớm có lạnh không?", "Sáng trên đồi mát và có sương, nhất là mùa đông; bạn nên mang áo khoác."),
             _qa("Nếu trời nhiều mây thì sao?", "Dù không thấy mặt trời mọc, sương và màu đồi chè vẫn rất đẹp. HTX sẽ báo nếu phải dời vì mưa."),
             _qa("Đường lên đồi có khó đi không?", "Đường mòn dốc nhẹ, đi bộ khoảng 20 phút. Hãy đi giày bám tốt.")),
        price_adult_vnd=180_000, price_child_vnd=100_000, default_seats=15),
    TourTemplate(
        key="classroom", title="Lớp học trên đồi chè", category="EDUCATION", duration_minutes=210,
        summary="Buổi trải nghiệm học tập cho học sinh: tìm hiểu cây chè, thực hành hái và pha trà, kể chuyện nghề của địa phương.",
        description=("Tour được thiết kế cho nhóm học sinh và giáo viên. Các em học về cây chè từ búp tới lá, thực hành hái "
                     "chè, xem chè được chế biến và tìm hiểu nghề của người dân vùng chè.\n\n"
                     "Mỗi nhóm có phiếu quan sát để hoàn thành trong buổi học; HTX có thể điều chỉnh nội dung theo "
                     "chương trình của trường. Giáo viên đi kèm được ưu đãi theo thoả thuận."),
        itinerary=(
            _step("08:00", "Đón đoàn và phổ biến nội quy", "Chia nhóm, phát phiếu quan sát và nhắc các quy tắc an toàn."),
            _step("08:30", "Tìm hiểu cây chè", "Người dẫn kể về cây chè, giống chè và mùa vụ ngay giữa luống chè."),
            _step("09:30", "Thực hành hái chè", "Mỗi em hái một nắm chè; giáo viên theo dõi các nhóm."),
            _step("10:30", "Xem chế biến chè", "Quan sát các bước sao và vò chè tại nhà nông hộ."),
            _step("11:15", "Thưởng trà và hỏi đáp", "Nghe kể chuyện nghề, đặt câu hỏi và nhận xét cuối buổi."),
        ),
        includes=("Người dẫn địa phương", "Phiếu quan sát cho từng nhóm", "Nước uống", "Trà và bánh nhẹ"),
        excludes=("Xe đưa đón của trường", "Chi tiêu cá nhân", "Bữa trưa"),
        bring=("Mũ nón", "Bút và sổ ghi chép", "Giày thể thao", "Nước uống cá nhân"),
        faq=(_qa("Đoàn tối thiểu bao nhiêu người?", "Bạn có thể đặt từ nhóm nhỏ; với đoàn trên 20 người, hãy dùng mục yêu cầu tour riêng để HTX sắp xếp."),
             _qa("Giáo viên đi kèm có phải trả phí không?", "HTX có thể ưu đãi cho giáo viên đi kèm; vui lòng liên hệ hotline khi đặt."),
             _qa("Có thể thay đổi nội dung theo chương trình học không?", "Có. Hãy gửi yêu cầu tour riêng, HTX sẽ gọi lại để trao đổi.")),
        price_adult_vnd=150_000, price_child_vnd=90_000, default_seats=40),
)}
