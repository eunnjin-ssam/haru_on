// 과제 면제권인지: 선생님이 쿠폰에 '과제 면제권'을 켰거나, 따로 정하지 않았으면 이름에 '면제'가 들어간 쿠폰.
export const isExemptCoupon = (item) => (item?.exempt ?? /면제/.test(item?.name ?? ''));
