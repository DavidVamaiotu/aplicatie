import React from 'react';
import { Users, Bed, ChevronRight, Tag } from 'lucide-react';

const RoomCard = ({ room, onBook, discount, todayPrice }) => {
    // Determine displayed price: prefer resolved todayPrice, fall back to room fields
    const displayPrice = (todayPrice?.price
        ?? room.basePrice
        ?? parseInt(String(room.price).replace(/[^0-9]/g, ''), 10))
        || 0;

    const priceLabel = todayPrice?.label; // Optional — only shown when present

    return (
        <div
            className="room-card group tap-highlight"
            onClick={() => onBook(room)}
        >
            {/* Image Container */}
            <div className="room-card-image-container">
                <img
                    src={room.image}
                    alt={room.title}
                    className="room-card-image"
                />
                {/* Price Tag */}
                <div className="room-card-price-tag">
                    <span className="price">{displayPrice} RON</span>
                    <span className="per-night"> / noapte</span>
                </div>
                {/* Seasonal Label */}
                {priceLabel && (
                    <div className="room-card-season-badge">
                        {priceLabel}
                    </div>
                )}
                {/* Discount Badge */}
                {discount && (
                    <div className="room-card-discount-badge">
                        <Tag size={12} />
                        <span>
                            {discount.discountType === 'percentage'
                                ? `-${discount.discountValue}%`
                                : `-${discount.discountValue} RON`
                            }
                        </span>
                    </div>
                )}
            </div>

            {/* Content Container */}
            <div className="room-card-content">
                <div className="room-card-header">
                    <h3 className="room-card-title">{room.title}</h3>
                    <ChevronRight size={20} className="room-card-arrow" />
                </div>

                <p className="room-card-description">
                    {room.seconddescription}
                </p>

                {/* Features Row */}
                <div className="room-card-features">
                    {room.facilities && room.facilities.length > 0 ? (
                        room.facilities.slice(0, 3).map((facility, index) => (
                            <div key={index} className="room-card-feature">
                                <span className="text-xs">{facility}</span>
                            </div>
                        ))
                    ) : (
                        <>
                            <div className="room-card-feature">
                                <Users size={14} />
                                <span>{room.capacity} persoane</span>
                            </div>
                            <div className="room-card-feature">
                                <Bed size={14} />
                                <span>Confortabil</span>
                            </div>
                        </>
                    )}
                </div>

                {/* Book Now Strip */}
                <div className="room-card-cta">
                    <span className="cta-text">Rezervă acum</span>
                    <div className="cta-arrow">
                        <ChevronRight size={16} />
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RoomCard;
