import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Sparkles, ChevronRight } from 'lucide-react';
import RoomCard from '../components/RoomCard';
import RoomCardSkeleton from '../components/RoomCardSkeleton';
import ScrollReveal from '../components/ScrollReveal';
import { getRooms } from '../data/rooms';

const Home = () => {
    const navigate = useNavigate();
    const [rooms, setRooms] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const fetchRooms = async () => {
            const data = await getRooms();
            setRooms(data);
            setLoading(false);
        };
        fetchRooms();
    }, []);

    const handleBook = (room) => {
        navigate(`/book/room/${room.id}`);
    };

    return (
        <div className="min-h-screen bg-gradient-dark pb-safe">
            {/* Hero Header Section with Parallax */}
            <div className="home-hero parallax-container">
                <div className="hero-overlay"></div>
                <div className="hero-content">
                    <div className="hero-badge animate-slide-up">
                        <MapPin size={14} />
                        <span>Vama Veche, România</span>
                    </div>
                    <h1 className="animate-slide-up hero-title-gold" style={{ animationDelay: '0.1s' }}>
                        Marina Park
                    </h1>
                    <p className="hero-subtitle animate-slide-up" style={{ animationDelay: '0.2s' }}>
                        Cazarea perfectă pentru vacanța ta la mare
                    </p>
                </div>
                <div className="hero-wave">
                    <svg viewBox="0 0 1440 120" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M0 120L60 110C120 100 240 80 360 70C480 60 600 60 720 65C840 70 960 80 1080 85C1200 90 1320 90 1380 90L1440 90V120H1380C1320 120 1200 120 1080 120C960 120 840 120 720 120C600 120 480 120 360 120C240 120 120 120 60 120H0Z" fill="var(--color-background)" />
                    </svg>
                </div>
            </div>

            {/* Section Header */}
            <div className="px-4 pt-6 pb-4">
                <div className="flex items-center justify-between">
                    <div>
                        <h2 className="section-heading">
                            <Sparkles size={20} className="text-primary" />
                            Camere Disponibile
                        </h2>
                        <p className="section-subheading">Alege camera perfectă pentru tine</p>
                    </div>
                    <button className="see-all-btn tap-highlight">
                        <span>Vezi toate</span>
                        <ChevronRight size={18} />
                    </button>
                </div>
            </div>

            {/* Room Cards */}
            <div className="px-4 pb-8">
                <div className="flex flex-col gap-12">
                    {loading ? (
                        <>
                            <RoomCardSkeleton />
                            <RoomCardSkeleton />
                            <RoomCardSkeleton />
                        </>
                    ) : (
                        rooms.map((room) => (
                            <ScrollReveal key={room.id}>
                                <RoomCard room={room} onBook={handleBook} />
                            </ScrollReveal>
                        ))
                    )}
                </div>
            </div>

            {/* Info Banner */}
            <ScrollReveal>
                <div className="px-4 pb-8">
                    <div className="info-banner">
                        <div className="info-banner-icon">🌊</div>
                        <div className="info-banner-content">
                            <h3>La doar 2 minute de plajă</h3>
                            <p>Bucură-te de acces rapid la plaja din Vama Veche</p>
                        </div>
                    </div>
                </div>
            </ScrollReveal>
        </div>
    );
};

export default Home;

