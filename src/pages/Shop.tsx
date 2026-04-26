import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { getStoredUser, saveUser, CurrentUser } from "../auth";

type EmoticonItem = { id: string; label: string; image: string };
type Product = { id: string; name: string; price: number; emoticons: EmoticonItem[]; coverImage: string; description: string };

export default function Shop() {
  const nav = useNavigate();
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [ownedEmoticons, setOwnedEmoticons] = useState<EmoticonItem[]>([]);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const load = async () => {
    const stored = getStoredUser();
    if (!stored) {
      alert("닉네임으로 먼저 시작해주세요.");
      nav("/");
      return;
    }
    setUser(stored);
    const productRes = await api<{ products: Product[] }>("/shop/products");
    const meRes = await api<{ user: CurrentUser; ownedEmoticons: EmoticonItem[] }>("/shop/me");
    setProducts(productRes.products);
    setOwnedEmoticons(meRes.ownedEmoticons);
    setUser(meRes.user);
    saveUser(meRes.user);
  };

  useEffect(() => {
    load().catch((e) => alert(e.message || "상점 정보를 불러오지 못했습니다."));
  }, []);

  const purchase = async (product: Product) => {
    setLoadingId(product.id);
    try {
      const res = await api<{ success: boolean; user: CurrentUser; ownedEmoticons: EmoticonItem[] }>("/shop/purchase", {
        method: "POST",
        body: JSON.stringify({ productId: product.id }),
      });
      setUser(res.user);
      saveUser(res.user);
      setOwnedEmoticons(res.ownedEmoticons);
      alert(`${product.name} 받기 완료! 이제 채팅에서 10가지 감정표현을 하나씩 보낼 수 있어요.`);
    } catch (e: any) {
      alert(e.message || "구매 실패");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="page wide">
      <h1>표현 상점 🛒</h1>
      <p className="muted">세트 1개를 구매하면 감정표현 10개를 대화창에서 개별 이미지로 보낼 수 있습니다.</p>
      <div className="card">
        <p>보유 코인 <b>{user?.coins ?? 0} 🪙</b></p>
        <p>사용 가능 감정표현 <b>{ownedEmoticons.length}개</b></p>
      </div>

      {products.map((product) => {
        const owned = user?.ownedEmoticonPacks?.includes(product.id);
        return (
          <div className="card sticker-product" key={product.id}>
            <div className="sticker-header">
              <div>
                <h2>{product.name}</h2>
                <p className="muted">{product.description}</p>
                <p><b>세트 가격 {product.price} 🪙</b> · 받으면 10개 감정표현 사용 가능</p>
              </div>
              <button disabled={owned || loadingId === product.id} onClick={() => purchase(product)}>
                {owned ? "보유중" : loadingId === product.id ? "받는 중..." : "세트 받기"}
              </button>
            </div>
            <img className="sticker-cover" src={product.coverImage} alt={product.name} />
            <div className="sticker-grid">
              {product.emoticons.map((item) => (
                <div className="sticker-thumb" key={item.id}>
                  <img src={item.image} alt={item.label} />
                  <span>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="row">
        <button className="secondary" onClick={() => nav("/")}>홈</button>
        <button onClick={() => nav("/call")}>5분 대화하기</button>
      </div>
    </div>
  );
}
