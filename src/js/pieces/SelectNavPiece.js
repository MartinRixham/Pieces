define([
	"./Library",
	"./Route",
	"./Subroute",
	"./Page"
], function SelectNavPiece(
	Library,
	Route,
	Subroute,
	Page) {

	var highestIndex = -1;

	function SelectNavPiece(pages) {

		var initialised = false;

		var route;

		var currentIndex = -1;

		var activeIndex = new Library.Datum(-1);

		var container;

		var subroute;

		this.datumPiecesPages = [];

		this.onBind = function(element) {

			var self = this;

			var event = document.createEvent("Event");
			event.initEvent("__PIECES_BIND__", true, true);
			element.dispatchEvent(event);

			route = Route.get();

			subroute = subroute ||
				new Subroute(
					route,
					function() { return currentIndex; },
					function(index) { self.showPage(index); });

			Route.set(subroute);

			this.datumPiecesPages = [];

			for (var i = 0; i < pages.length; i++) {

				this.datumPiecesPages.push(new Page(i, pages[i].page, subroute));
			}

			while (element.firstChild) {

				element.removeChild(element.firstChild);
			}

			element.style.paddingTop = "1px";

			var page = document.createElement("DIV");

			container = document.createElement("DIV");
			container.dataset.bind = "datumPiecesPages";
			container.appendChild(page);

			element.appendChild(container);

			route.addRoute({

				set: function(word, routeIndex) {

					routePage(word, routeIndex);
					route.update(routeIndex);
				},
				get: function(nonBlank) {

					if (nonBlank && currentIndex < 0) {

						return pages[0].route;
					}
					else if (pages[currentIndex]) {

						return pages[currentIndex].route;
					}
					else {

						return "";
					}
				}
			}, true);
		};

		function routePage(hash, routeIndex) {

			for (var i = 0; i < pages.length; i++) {

				if (pages[i].route == hash) {

					highestIndex = Math.max(highestIndex, routeIndex);

					currentIndex = i;
					activeIndex(i);

					return;
				}
			}

			initialised = true;
			currentIndex = -1;
			activeIndex(-1);
		}

		this.showPage = function(index) {

			if (!initialised) {

				return;
			}

			var child = container.children[index];

			if (child) {

				child.scrollIntoView({ behavior: "smooth", block: "start" });
			}
		};

		this.getCurrentIndex = function() {

			return activeIndex();
		};
	}

	return SelectNavPiece;
});
