import React from 'react';
import { useNavigate } from 'react-router-dom';
import RoomCard from '../components/RoomCard';
import RoomCardSkeleton from '../components/RoomCardSkeleton';
import ScrollReveal from '../components/ScrollReveal';
import { getCampingSpots } from '../data/rooms';
import { Tent } from 'lucide-react';

const Camping = () => {
    const navigate = useNavigate();
    const [spots, setSpots] = React.useState([]);
    const [loading, setLoading] = React.useState(true);

    React.useEffect(() => {
        const fetchSpots = async () => {
            const data = await getCampingSpots();
            setSpots(data);
            setLoading(false);
        };
        fetchSpots();
    }, []);

    const handleBook = (spot) => {
        navigate(`/book-camping/${spot.id}`);
    };

    return (
        <div className="animate-fade-in pb-safe pt-6">
            <div className="px-4 pb-8">
                <div className="flex flex-col gap-12">
                    {loading ? (
                        <>
                            <RoomCardSkeleton />
                            <RoomCardSkeleton />
                        </>
                    ) : (
                        spots.map((spot) => (
                            <ScrollReveal key={spot.id}>
                                <RoomCard room={spot} onBook={handleBook} />
                            </ScrollReveal>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default Camping;

